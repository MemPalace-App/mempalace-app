const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const app = express();
const PORT = 3000;

const PUBLIC_FOLDER = path.join(__dirname, "public");
const DATA_FOLDER = path.join(PUBLIC_FOLDER, "mempalace-data");
const IMAGES_FOLDER = path.join(DATA_FOLDER, "mempalace-images");
const DB_FILE = path.join(DATA_FOLDER, "mempalace.json");

const SECRET_KEY = crypto.createHash("sha256")
  .update("mempalace-secret-key")
  .digest();

if (!fs.existsSync(PUBLIC_FOLDER)) fs.mkdirSync(PUBLIC_FOLDER, { recursive: true });
if (!fs.existsSync(DATA_FOLDER)) fs.mkdirSync(DATA_FOLDER, { recursive: true });
if (!fs.existsSync(IMAGES_FOLDER)) fs.mkdirSync(IMAGES_FOLDER, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ wings: [] }, null, 2));

app.use(express.json({ limit: "10mb" }));
app.use(express.static(PUBLIC_FOLDER));

const upload = multer({ dest: IMAGES_FOLDER });

function loadDB() { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function encryptText(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", SECRET_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return { iv: iv.toString("hex"), data: encrypted };
}
function decryptText(payload) {
  const iv = Buffer.from(payload.iv, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", SECRET_KEY, iv);
  let decrypted = decipher.update(payload.data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function encryptImage(buffer) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", SECRET_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return { iv: iv.toString("hex"), data: encrypted.toString("hex") };
}
function decryptImage(payload) {
  const iv = Buffer.from(payload.iv, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", SECRET_KEY, iv);
  return Buffer.concat([decipher.update(Buffer.from(payload.data, "hex")), decipher.final()]);
}

function ensureStructure(db, wingLabel, roomDate, closetTopic) {
  let wing = db.wings.find(w => w.label === wingLabel);
  if (!wing) {
    wing = { id: Date.now(), code: `W-${String(db.wings.length+1).padStart(3,"0")}`, label: wingLabel, rooms: [] };
    db.wings.push(wing);
  }
  let room = wing.rooms.find(r => r.date === roomDate);
  if (!room) {
    room = { id: Date.now(), code: `R-${String(wing.rooms.length+1).padStart(2,"0")}`, date: roomDate, closets: [] };
    wing.rooms.push(room);
  }
  let closet = room.closets.find(c => c.topic === closetTopic);
  if (!closet) {
    closet = { id: Date.now(), code: `C-${String(room.closets.length+1).padStart(2,"0")}`, topic: closetTopic, drawers: [] };
    room.closets.push(closet);
  }
  return { wing, room, closet };
}

function flattenDrawers(db) {
  const out = [];
  for (const wing of db.wings) {
    for (const room of wing.rooms) {
      for (const closet of room.closets) {
        for (const drawer of closet.drawers) {
          out.push({
            id: drawer.id,
            name: drawer.name || "",
            tags: drawer.tags || "",
            preview: drawer.preview || "",
            file: drawer.file || "",
            images: drawer.images || [],
            createdAt: drawer.createdAt || Date.now(),
            wingLabel: wing.label,
            roomDate: room.date,
            closetTopic: closet.topic
          });
        }
      }
    }
  }
  return out;
}
function pluralize(count, word) {
  return count === 1 ? `${count} ${word}` : `${count} ${word}s`;
}

// unified save (create or update)
app.post("/api/save", upload.array("images"), (req, res) => {
  try {
    const { id, wingLabel, roomDate, closetTopic, name, tags, text, removeImages } = req.body;
    const db = loadDB();

    let target;
    let wingNode, roomNode, closetNode;

    if (id) {
      // update existing
      for (const w of db.wings) {
        for (const r of w.rooms) {
          for (const c of r.closets) {
            const d = c.drawers.find(dr => dr.id === Number(id));
            if (d) {
              target = d;
              wingNode = w;
              roomNode = r;
              closetNode = c;
            }
          }
        }
      }
      if (!target) return res.json({ status: "error", message: "Drawer not found" });
    } else {
      // create new
      const { closet: targetCloset, wing: newWing, room: newRoom } = ensureStructure(db, wingLabel, roomDate, closetTopic);
      target = { id: Date.now(), createdAt: Date.now(), images: [] };
      targetCloset.drawers.push(target);
      wingNode = newWing;
      roomNode = newRoom;
      closetNode = targetCloset;
    }

    // update drawer fields
    target.wingLabel = wingLabel;
    target.roomDate = roomDate;
    target.closetTopic = closetTopic;
    target.name = name;
    target.tags = tags;
    target.preview = text?.slice(0, 100);

    // also update hierarchy labels so renames persist
    if (wingNode) wingNode.label = wingLabel;
    if (roomNode) roomNode.date = roomDate;
    if (closetNode) closetNode.topic = closetTopic;

    // save text encrypted
    const encText = encryptText(text || "");
    const fileName = `drawer-${target.id}.json`;
    fs.writeFileSync(path.join(DATA_FOLDER, fileName), JSON.stringify(encText, null, 2));
    target.file = fileName;

    // remove images
    if (removeImages) {
      const toRemove = JSON.parse(removeImages);
      target.images = (target.images || []).filter(img => {
        if (toRemove.includes(img)) {
          const imgPath = path.join(IMAGES_FOLDER, img);
          if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
          return false;
        }
        return true;
      });
    }

    // add new images
    if (req.files && req.files.length) {
      req.files.forEach(file => {
        const buffer = fs.readFileSync(file.path);
        const encrypted = encryptImage(buffer);
        const encFile = `image-${Date.now()}-${Math.floor(Math.random()*1000)}.json`;
        fs.writeFileSync(path.join(IMAGES_FOLDER, encFile), JSON.stringify(encrypted, null, 2));
        fs.unlinkSync(file.path);
        target.images.push(encFile);
      });
    }

    saveDB(db);
    res.json({ status: "ok", drawer: target });
  } catch (err) {
    console.error(err);
    res.json({ status: "error", message: "Internal server error" });
  }
});

// get image
app.get("/api/getImage/:file", (req,res)=>{
  try {
    const encPath = path.join(IMAGES_FOLDER, req.params.file);
    if (!fs.existsSync(encPath)) return res.status(404).send("Not found");
    const payload = JSON.parse(fs.readFileSync(encPath,"utf8"));
    const buffer = decryptImage(payload);
    res.writeHead(200,{"Content-Type":"image/png","Content-Length":buffer.length});
    res.end(buffer);
  } catch(err){ console.error(err); res.status(500).send("Internal server error"); }
});

// list
app.get("/api/list",(req,res)=>{
  try {
    const db=loadDB();
    const flat=flattenDrawers(db).sort((a,b)=>b.createdAt-a.createdAt);
    res.json({status:"ok",memories:flat,countLabel:pluralize(flat.length,"drawer")});
  } catch(err){ console.error(err); res.json({status:"error",message:"Internal server error"}); }
});

// search
app.post("/api/search",(req,res)=>{
  try {
    const {query} = req.body;
    if (!query) return res.json({status:"error",message:"No query provided"});

    const db = loadDB();
    const flat = flattenDrawers(db);
    const q = query.toLowerCase();

    const results = flat.filter(m => {
      const haystack = [
        m.id?.toString() || "",
        m.name || "",
        m.preview || "",
        m.wingLabel || "",
        m.roomDate || "",
        m.closetTopic || "",
        m.tags || "",
        m.file || ""
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    }).sort((a,b)=> b.createdAt - a.createdAt);

    res.json({
      status:"ok",
      results,
      countLabel: pluralize(results.length,"drawer")
    });
  } catch(err){
    console.error(err);
    res.json({status:"error",message:"Internal server error"});
  }
});

// open (load full text + images)
app.post("/api/open",(req,res)=>{
  try {
    const {id}=req.body;
    if(!id) return res.json({status:"error",message:"No id provided"});
    const db=loadDB();
    const flat=flattenDrawers(db);
    const mem=flat.find(m=>m.id===Number(id));
    if(!mem) return res.json({status:"error",message:"Drawer not found"});
    const filepath=path.join(DATA_FOLDER,mem.file);
    if(!fs.existsSync(filepath)) return res.json({status:"error",message:"Drawer file missing"});
    const encrypted=JSON.parse(fs.readFileSync(filepath,"utf8"));
    const text=decryptText(encrypted);
    // return full memory object with text and images
    res.json({status:"ok",memory:{...mem,text,images:mem.images||[]}});
  } catch(err){ 
    console.error(err); 
    res.json({status:"error",message:"Internal server error"}); 
  }
});

// delete
app.post("/api/delete",(req,res)=>{
  try {
    const {id}=req.body;
    if(!id) return res.json({status:"error",message:"No id provided"});
    const db=loadDB();
    let deleted=false;
    for(const wing of db.wings){
      for(const room of wing.rooms){
        for(const closet of room.closets){
          const idx=closet.drawers.findIndex(d=>d.id===Number(id));
          if(idx!==-1){
            const [drawer]=closet.drawers.splice(idx,1);
            const filepath=path.join(DATA_FOLDER,drawer.file);
            if(fs.existsSync(filepath)) fs.unlinkSync(filepath);
            if(drawer.images&&drawer.images.length){
              drawer.images.forEach(img=>{
                const imgPath=path.join(IMAGES_FOLDER,img);
                if(fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
              });
            }
            deleted=true;
            break;
          }
        }
      }
    }
    if(deleted){ 
      saveDB(db); 
      res.json({status:"ok"}); 
    } else { 
      res.json({status:"error",message:"Drawer not found"}); 
    }
  } catch(err){ 
    console.error(err); 
    res.json({status:"error",message:"Internal server error"}); 
  }
});

app.listen(PORT,()=>{ 
  console.log(`MemPalace W/R/C/D console running at http://localhost:${PORT}`); 
});