/* ==========================================================================
   CLOUD ASSIGNMENT MANAGER - CLIENT JAVASCRIPT
   Interactive features, client-side validation, drag-and-drop, search filters
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initAlertDismissal();
  initFileUploadZone();
  initFormValidation();
  initSubjectSync();
  initTableSearch();
  initAssignmentFilters();
  initModal();
});

/* --------------------------------------------------------------------------
   1. Mobile Navigation Toggle
   -------------------------------------------------------------------------- */
function initMobileNav() {
  const toggleBtn = document.getElementById("mobileToggle");
  const navMenu = document.getElementById("navMenu");

  if (toggleBtn && navMenu) {
    toggleBtn.addEventListener("click", () => {
      navMenu.classList.toggle("show");
    });
  }
}

/* --------------------------------------------------------------------------
   2. Alert Dismissal (Manual & Auto)
   -------------------------------------------------------------------------- */
function initAlertDismissal() {
  const alertBoxes = document.querySelectorAll(".alert");
  alertBoxes.forEach((alert) => {
    const closeBtn = alert.querySelector(".alert-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        alert.style.transition = "opacity 0.3s ease, transform 0.3s ease";
        alert.style.opacity = "0";
        alert.style.transform = "translateY(-10px)";
        setTimeout(() => alert.remove(), 300);
      });
    }

    // Auto-dismiss after 7 seconds if not an error alert
    if (!alert.classList.contains("alert-error")) {
      setTimeout(() => {
        if (document.body.contains(alert)) {
          alert.style.transition = "opacity 0.5s ease";
          alert.style.opacity = "0";
          setTimeout(() => alert.remove(), 500);
        }
      }, 7000);
    }
  });
}

/* --------------------------------------------------------------------------
   3. Drag-and-Drop & File Preview
   -------------------------------------------------------------------------- */
function initFileUploadZone() {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const filePreview = document.getElementById("filePreview");
  const fileNameDisplay = document.getElementById("fileNameDisplay");
  const fileSizeDisplay = document.getElementById("fileSizeDisplay");

  if (!dropZone || !fileInput) return;

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("dragover");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      updateFilePreview(files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (fileInput.files.length > 0) {
      updateFilePreview(fileInput.files[0]);
    }
  });

  function updateFilePreview(file) {
    if (!filePreview || !fileNameDisplay) return;

    fileNameDisplay.textContent = file.name;
    if (fileSizeDisplay) {
      fileSizeDisplay.textContent = `(${formatBytes(file.size)})`;
    }
    filePreview.style.display = "flex";
  }
}

/* --------------------------------------------------------------------------
   4. Client-side Form Validation
   -------------------------------------------------------------------------- */
function initFormValidation() {
  const uploadForm = document.getElementById("uploadForm");
  const fileInput = document.getElementById("fileInput");

  if (!uploadForm || !fileInput) return;

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_EXTS = [".pdf", ".doc", ".docx", ".zip"];

  uploadForm.addEventListener("submit", (e) => {
    const file = fileInput.files[0];

    if (!file) {
      e.preventDefault();
      showClientError("Please select a file to upload.");
      return;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      e.preventDefault();
      showClientError(
        `File size (${formatBytes(file.size)}) exceeds the maximum allowed limit of 5 MB.`
      );
      return;
    }

    // Check extension
    const ext = getFileExtension(file.name).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      e.preventDefault();
      showClientError(
        `Unsupported file type "${ext}". Only PDF, DOC, DOCX, and ZIP files are permitted.`
      );
      return;
    }

    // Show submitting indicator on the upload button
    const submitBtn = uploadForm.querySelector("button[type='submit']");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <span style="display:inline-block; animation: spin 1s infinite linear;">⟳</span>
        Uploading Assignment...
      `;
    }
  });

  function showClientError(msg) {
    let alertContainer = document.getElementById("alertContainer");
    if (!alertContainer) {
      alertContainer = document.createElement("div");
      alertContainer.id = "alertContainer";
      uploadForm.parentNode.insertBefore(alertContainer, uploadForm);
    }

    alertContainer.innerHTML = `
      <div class="alert alert-error">
        <div class="alert-content">
          <span class="alert-icon">⚠️</span>
          <span>${escapeHtml(msg)}</span>
        </div>
        <button type="button" class="alert-close" onclick="this.parentElement.remove()">&times;</button>
      </div>
    `;
    window.scrollTo({ top: uploadForm.offsetTop - 100, behavior: "smooth" });
  }
}

/* --------------------------------------------------------------------------
   5. Subject and Assignment Dropdown Sync
   -------------------------------------------------------------------------- */
function initSubjectSync() {
  const subjectSelect = document.getElementById("subjectSelect");
  const assignmentSelect = document.getElementById("assignmentTitleSelect");

  if (!subjectSelect || !assignmentSelect) return;

  subjectSelect.addEventListener("change", () => {
    const selectedSubject = subjectSelect.value;
    const options = assignmentSelect.querySelectorAll("option");

    let firstMatch = null;
    options.forEach((opt) => {
      const optSubject = opt.getAttribute("data-subject");
      if (!optSubject || opt.value === "") {
        opt.style.display = "";
      } else if (optSubject === selectedSubject) {
        opt.style.display = "";
        if (!firstMatch) firstMatch = opt;
      } else {
        opt.style.display = "none";
      }
    });

    if (firstMatch) {
      assignmentSelect.value = firstMatch.value;
    } else {
      assignmentSelect.value = "";
    }
  });
}

/* --------------------------------------------------------------------------
   6. Table Search & Filtering (Files Page)
   -------------------------------------------------------------------------- */
function initTableSearch() {
  const searchInput = document.getElementById("filesTableSearch");
  const table = document.getElementById("filesTable");

  if (!searchInput || !table) return;

  const rows = table.querySelectorAll("tbody tr");
  const noMatchesRow = document.getElementById("noMatchesRow");

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase().trim();
    let visibleCount = 0;

    rows.forEach((row) => {
      if (row.id === "noMatchesRow") return;

      const text = row.innerText.toLowerCase();
      if (text.includes(query)) {
        row.style.display = "";
        visibleCount++;
      } else {
        row.style.display = "none";
      }
    });

    if (noMatchesRow) {
      noMatchesRow.style.display = visibleCount === 0 ? "" : "none";
    }
  });
}

/* --------------------------------------------------------------------------
   7. Assignment Filters (Assignments Page)
   -------------------------------------------------------------------------- */
function initAssignmentFilters() {
  const searchInput = document.getElementById("assignmentSearch");
  const subjectFilter = document.getElementById("subjectFilter");
  const cards = document.querySelectorAll(".assignment-card");
  const emptyState = document.getElementById("assignmentsEmptyState");

  if (!cards.length) return;

  function filterCards() {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const subject = subjectFilter ? subjectFilter.value : "";
    let visibleCount = 0;

    cards.forEach((card) => {
      const cardText = card.innerText.toLowerCase();
      const cardSubject = card.getAttribute("data-subject") || "";

      const matchesSearch = !query || cardText.includes(query);
      const matchesSubject = !subject || cardSubject === subject;

      if (matchesSearch && matchesSubject) {
        card.style.display = "";
        visibleCount++;
      } else {
        card.style.display = "none";
      }
    });

    if (emptyState) {
      emptyState.style.display = visibleCount === 0 ? "block" : "none";
    }
  }

  if (searchInput) searchInput.addEventListener("input", filterCards);
  if (subjectFilter) subjectFilter.addEventListener("change", filterCards);
}

/* --------------------------------------------------------------------------
   8. Assignment Detail Modal
   -------------------------------------------------------------------------- */
function initModal() {
  const modalOverlay = document.getElementById("assignmentModal");
  if (!modalOverlay) return;

  const modalTitle = document.getElementById("modalTitle");
  const modalSubject = document.getElementById("modalSubject");
  const modalDueDate = document.getElementById("modalDueDate");
  const modalFaculty = document.getElementById("modalFaculty");
  const modalPoints = document.getElementById("modalPoints");
  const modalDesc = document.getElementById("modalDesc");
  const modalSubmitBtn = document.getElementById("modalSubmitBtn");

  const detailButtons = document.querySelectorAll(".view-details-btn");

  detailButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const title = btn.getAttribute("data-title");
      const subject = btn.getAttribute("data-subject");
      const dueDate = btn.getAttribute("data-due");
      const faculty = btn.getAttribute("data-faculty");
      const points = btn.getAttribute("data-points");
      const desc = btn.getAttribute("data-desc");
      const id = btn.getAttribute("data-id");

      if (modalTitle) modalTitle.textContent = title;
      if (modalSubject) modalSubject.textContent = subject;
      if (modalDueDate) modalDueDate.textContent = dueDate;
      if (modalFaculty) modalFaculty.textContent = faculty;
      if (modalPoints) modalPoints.textContent = points + " pts";
      if (modalDesc) modalDesc.textContent = desc;

      if (modalSubmitBtn) {
        modalSubmitBtn.href = `/upload?subject=${encodeURIComponent(
          subject
        )}&assignmentTitle=${encodeURIComponent(title)}`;
      }

      modalOverlay.classList.add("active");
    });
  });

  // Close handlers
  const closeButtons = modalOverlay.querySelectorAll(".modal-close-trigger");
  closeButtons.forEach((b) => {
    b.addEventListener("click", () => {
      modalOverlay.classList.remove("active");
    });
  });

  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.remove("active");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOverlay.classList.contains("active")) {
      modalOverlay.classList.remove("active");
    }
  });
}

/* --------------------------------------------------------------------------
   Utilities
   -------------------------------------------------------------------------- */
function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function getFileExtension(filename) {
  return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2) ? "." + filename.split(".").pop() : "";
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
