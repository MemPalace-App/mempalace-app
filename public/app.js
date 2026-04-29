// app.js

const consoleLog = document.getElementById("consoleLog");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const searchBtn = document.getElementById("searchBtn");
const refreshBtn = document.getElementById("refreshBtn");
const deleteBtn = document.getElementById("deleteBtn");

const wingInput = document.getElementById("wingInput");
const roomInput = document.getElementById("roomInput");
const closetInput = document.getElementById("closetInput");
const nameInput = document.getElementById("nameInput");
const tagsInput = document.getElementById("tagsInput");
const textInput = document.getElementById("textInput");
const fileInput = document.getElementById("fileInput");
const imageInput = document.getElementById("imageInput");
const thumbnailPreview = document.getElementById("thumbnailPreview");
const editImages = document.getElementById("editImages");
const currentIdInput = document.getElementById("currentId");

const memoryList = document.getElementById("memoryList");

const overlay = document.getElementById("imageOverlay");
const overlayImage = document.getElementById("overlayImage");
const overlayClose = document.getElementById("overlayClose");
const overlayPrev = document.getElementById("overlayPrev");
const overlayNext = document.getElementById("overlayNext");

const mempanel = document.getElementById("mempanel-section");

let overlayIndex = 0;
let overlayFiles = [];
let removedImages = [];

// Utility
function addLog(who, body, type="system") {
  const msg = document.createElement("div");
  msg.className = `msg ${type}`;
  msg.innerHTML = `<span class="who">${who}</span><span class="body">${body}</span>`;
  consoleLog.appendChild(msg);
  consoleLog.scrollTop = consoleLog.scrollHeight;
}

function pluralize(count, word) {
  return count === 1 ? `${count} ${word}` : `${count} ${word}s`;
}

// Clear form
function clearEditableFields() {
  // Reset all editable text fields
  [wingInput, roomInput, closetInput, nameInput, tagsInput, textInput].forEach(el => el.innerText = "");
  
  // Reset file inputs
  fileInput.value = "";
  imageInput.value = "";
  
  // Clear thumbnails and current images
  thumbnailPreview.innerHTML = "";
  editImages.innerHTML = "";
  
  // Reset hidden ID and removed images list
  currentIdInput.value = "";
  removedImages = [];
  
  // Remove detail-view mode so full form is visible again
  mempanel.classList.remove("detail-view");
  
  // Reset visibility for editing mode
  textInput.style.display = "";
  editImages.style.display = "";
}


// Load all
async function loadAll() {
  const res = await fetch("/api/list");
  const data = await res.json();
  if (data.status === "ok") {
    memoryList.innerHTML = "";
    data.memories.forEach(mem => {
      const div = document.createElement("div");
      div.className = "mem-item";
      div.textContent = `${mem.name || "(untitled)"} — ${mem.wingLabel}/${mem.roomDate}/${mem.closetTopic}`;
      div.onclick = () => openDrawer(mem.id);
      memoryList.appendChild(div);
    });
    addLog("mem", `loaded ${data.countLabel}`, "retrieval");
  }
}

// Helper to toggle visibility between detail-view and edit mode
function toggleDetailView(enable) {
  if (enable) {
    // Hide metadata rows
    document.querySelectorAll(
      '#wingInput, #roomInput, #closetInput, #nameInput, #tagsInput, #fileInput, #imageInput, #thumbnailPreview'
    ).forEach(el => {
      if (el.parentElement) el.parentElement.style.display = "none";
    });

    // Show text + images only
    if (textInput.parentElement) textInput.parentElement.style.display = "block";
    if (editImages.parentElement) editImages.parentElement.style.display = "block";
  } else {
    // Show all rows again
    document.querySelectorAll(".form-row").forEach(el => el.style.display = "");
  }
}

// Open drawer (detail view mode)
async function openDrawer(id) {
  const res = await fetch("/api/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });
  const data = await res.json();
  if (data.status === "ok") {
    const mem = data.memory;

    // Fill form fields
    wingInput.innerText = mem.wingLabel;
    roomInput.innerText = mem.roomDate;
    closetInput.innerText = mem.closetTopic;
    nameInput.innerText = mem.name || "";
    tagsInput.innerText = mem.tags || "";
    textInput.innerText = mem.text;
    currentIdInput.value = mem.id;

    removedImages = [];
    editImages.innerHTML = "";

    // In detail-view mode, show thumbnails only (no remove buttons)
    mem.images.forEach((img, idx) => {
      const thumb = document.createElement("img");
      thumb.src = `/api/getImage/${img}`;
      thumb.className = "thumb";
      thumb.onclick = () => showOverlay(mem.images, idx);
      editImages.appendChild(thumb);
    });

    // Switch to detail view mode and scroll into view
    mempanel.classList.add("detail-view");
    toggleDetailView(true);
    mempanel.scrollIntoView({ behavior: "smooth" });
  } else {
    addLog("mem", `error: ${data.message}`, "ai");
  }
}


// Reference the Create / Edit button
const createEditBtn = document.getElementById("createEditBtn");

// Toggle back to create/edit mode
createEditBtn.addEventListener("click", () => {
  // Remove detail-view so all form rows are visible again
  mempanel.classList.remove("detail-view");

  // Show all form rows again
  document.querySelectorAll(".form-row").forEach(el => el.style.display = "");

  // Restore editable fields
  [wingInput, roomInput, closetInput, nameInput, tagsInput, textInput].forEach(el => {
    el.setAttribute("contenteditable", "true");
  });

  // Ensure text and image sections are visible
  textInput.style.display = "";
  editImages.style.display = "";

  // Reset thumbnails with remove buttons if current drawer has images
  editImages.innerHTML = "";
  removedImages = [];

  if (currentIdInput.value) {
    // Re-fetch the current drawer to rebuild edit thumbnails
    fetch("/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: currentIdInput.value })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === "ok") {
        const mem = data.memory;
        mem.images.forEach(img => {
          const wrapper = document.createElement("div");
          wrapper.className = "edit-thumb";

          const thumb = document.createElement("img");
          thumb.src = `/api/getImage/${img}`;
          thumb.className = "thumb";

          const removeBtn = document.createElement("button");
          removeBtn.textContent = "Remove";
          removeBtn.onclick = () => {
            removedImages.push(img);
            wrapper.remove();
          };

          wrapper.appendChild(thumb);
          wrapper.appendChild(removeBtn);
          editImages.appendChild(wrapper);
        });
      }
    });
  }

  // Clear new upload preview
  thumbnailPreview.innerHTML = "";
});
// Save (create or update)
saveBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  const formData = new FormData();

  // include ID if editing an existing drawer
  if (currentIdInput.value) {
    formData.append("id", currentIdInput.value);
  }

  // use backend field names
  formData.append("wingLabel", wingInput.innerText.trim());
  formData.append("roomDate", roomInput.innerText.trim());
  formData.append("closetTopic", closetInput.innerText.trim());
  formData.append("name", nameInput.innerText.trim());
  formData.append("tags", tagsInput.innerText.trim());
  formData.append("text", textInput.innerText.trim());

  // attach new images
  for (const file of imageInput.files) {
    formData.append("images", file);
  }

  // mark removed images
  if (removedImages.length) {
    formData.append("removeImages", JSON.stringify(removedImages));
  }

  // send to backend
  const res = await fetch("/api/save", { method: "POST", body: formData });
  const data = await res.json();

  if (data.status === "ok") {
    addLog("mem", `saved drawer with ${pluralize(data.drawer.images.length, "image")}`, "retrieval");
    clearEditableFields();
    await loadAll();
  } else {
    addLog("mem", `error: ${data.message}`, "ai");
  }
});

// Clear
clearBtn.addEventListener("click", (e) => {
  e.preventDefault();
  clearEditableFields();
});

// Search
searchBtn.addEventListener("click", async () => {
  const q = document.getElementById("searchInput").innerText.trim();
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q })
  });
  const data = await res.json();
  if (data.status === "ok") {
    memoryList.innerHTML = "";
    data.results.forEach(mem => {
      const item = document.createElement("div");
      item.className = "mem-item";

      const top = document.createElement("div");
      top.className = "mem-top";
      const name = document.createElement("div");
      name.className = "mem-name";
      name.textContent = mem.name || "(untitled)";
      const path = document.createElement("div");
      path.className = "mem-path";
      path.textContent = `${mem.wingLabel}/${mem.roomDate}/${mem.closetTopic}`;
      top.appendChild(name);
      top.appendChild(path);

      const meta = document.createElement("div");
      meta.className = "mem-meta";
      if (mem.tags) {
        mem.tags.split(",").forEach(tag => {
          const span = document.createElement("span");
          span.textContent = tag.trim();
          meta.appendChild(span);
        });
      }

      const preview = document.createElement("div");
      preview.className = "mem-preview";
      preview.textContent = mem.preview || "";

      item.appendChild(top);
      item.appendChild(meta);
      item.appendChild(preview);

      item.onclick = () => openDrawer(mem.id);

      memoryList.appendChild(item);
    });
    addLog("mem", `found ${data.countLabel}`, "retrieval");
  }
});

// Refresh
refreshBtn.addEventListener("click", loadAll);

// Delete
deleteBtn.addEventListener("click", async () => {
  if (!currentIdInput.value) return;
  const res = await fetch("/api/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: currentIdInput.value })
  });
  const data = await res.json();
  if (data.status === "ok") {
    addLog("mem", "drawer deleted", "retrieval");
    clearEditableFields();
    await loadAll();
  } else {
    addLog("mem", `error: ${data.message}`, "ai");
  }
});

// Thumbnail preview for new images (with remove buttons)
imageInput.addEventListener("change", () => {
  thumbnailPreview.innerHTML = "";
  for (const file of imageInput.files) {
    const reader = new FileReader();
    reader.onload = e => {
      const wrapper = document.createElement("div");
      wrapper.className = "edit-thumb";

      const img = document.createElement("img");
      img.src = e.target.result;
      img.className = "thumb";

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.onclick = () => {
        wrapper.remove();
        // optional: track removed new files if needed
        removedImages.push(file.name);
      };

      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      thumbnailPreview.appendChild(wrapper);
    };
    reader.readAsDataURL(file);
  }
});

// Overlay
function showOverlay(files, idx) {
  overlayFiles = files;
  overlayIndex = idx;
  overlayImage.src = `/api/getImage/${files[idx]}`;
  overlay.style.display = "block";
}

overlayClose.onclick = () => overlay.style.display = "none";

overlayPrev.onclick = () => {
  overlayIndex = (overlayIndex - 1 + overlayFiles.length) % overlayFiles.length;
  overlayImage.src = `/api/getImage/${overlayFiles[overlayIndex]}`;
};

overlayNext.onclick = () => {
  overlayIndex = (overlayIndex + 1) % overlayFiles.length;
  overlayImage.src = `/api/getImage/${overlayFiles[overlayIndex]}`;
};

// Close overlay when clicking outside the image
overlay.onclick = (e) => {
  if (e.target === overlay) {
    overlay.style.display = "none";
  }
};

// Listen for keyboard events
document.addEventListener("keydown", (e) => {
  if (overlay.style.display === "block") {
    if (e.key === "ArrowLeft") {
      overlayIndex = (overlayIndex - 1 + overlayFiles.length) % overlayFiles.length;
      overlayImage.src = `/api/getImage/${overlayFiles[overlayIndex]}`;
    }
    if (e.key === "ArrowRight") {
      overlayIndex = (overlayIndex + 1) % overlayFiles.length;
      overlayImage.src = `/api/getImage/${overlayFiles[overlayIndex]}`;
    }
    if (e.key === "Escape") {
      overlay.style.display = "none";
    }
  }
});

// Initialize
window.addEventListener("DOMContentLoaded", async () => {
  await loadAll();
  addLog("mem", "console initialized", "system");
});
