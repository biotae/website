/* ── State ─────────────────────────────────────────── */
let currentCategory = 'All';
let currentPostId   = null;
let selectedFiles   = [];
let searchTimer     = null;

/* ── Helpers ───────────────────────────────────────── */
function formatDate(str) {
  const d = new Date(str + (str.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function fileIcon(mime) {
  if (!mime) return '📄';
  if (mime.startsWith('image/'))       return '🖼️';
  if (mime.startsWith('video/'))       return '🎬';
  if (mime.startsWith('audio/'))       return '🎵';
  if (mime.includes('pdf'))            return '📕';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel'))   return '📊';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📊';
  if (mime.includes('zip') || mime.includes('compressed')) return '🗜️';
  return '📄';
}

/* ── DOM refs ──────────────────────────────────────── */
const postList       = document.getElementById('postList');
const emptyMsg       = document.getElementById('emptyMsg');
const statsBox       = document.getElementById('statsBox');
const categoryItems  = document.querySelectorAll('#categoryList li');
const searchInput    = document.getElementById('searchInput');

const newPostModal   = document.getElementById('newPostModal');
const openNewPostBtn = document.getElementById('openNewPostBtn');
const closeNewPost   = document.getElementById('closeNewPost');
const cancelNewPost  = document.getElementById('cancelNewPost');
const newPostForm    = document.getElementById('newPostForm');
const fileDrop       = document.getElementById('fileDrop');
const fileInput      = document.getElementById('fileInput');
const filePreview    = document.getElementById('filePreview');

const postDetailModal = document.getElementById('postDetailModal');
const closeDetail     = document.getElementById('closeDetail');
const detailCategory  = document.getElementById('detailCategory');
const detailTitle     = document.getElementById('detailTitle');
const detailMeta      = document.getElementById('detailMeta');
const detailContent   = document.getElementById('detailContent');
const detailFiles     = document.getElementById('detailFiles');
const commentList     = document.getElementById('commentList');
const commentCount    = document.getElementById('commentCount');
const commentForm     = document.getElementById('commentForm');
const commentAuthor   = document.getElementById('commentAuthor');
const commentContent  = document.getElementById('commentContent');

/* ── Fetch helpers ─────────────────────────────────── */
async function api(method, url, body) {
  const opts = { method };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

/* ── Load posts ────────────────────────────────────── */
async function loadPosts() {
  const params = new URLSearchParams();
  if (currentCategory !== 'All') params.set('category', currentCategory);
  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());

  try {
    const posts = await api('GET', '/api/posts?' + params.toString());
    renderPosts(posts);
  } catch (e) {
    console.error(e);
  }
}

function renderPosts(posts) {
  postList.innerHTML = '';
  emptyMsg.hidden = posts.length > 0;

  // Update stats
  statsBox.innerHTML = `<strong>${posts.length}</strong> post${posts.length !== 1 ? 's' : ''} found`;

  posts.forEach(p => {
    const card = document.createElement('article');
    card.className = 'post-card';
    card.innerHTML = `
      <div class="post-card-top">
        <div>
          <span class="badge ${p.category}">${p.category}</span>
          <h2>${escHtml(p.title)}</h2>
          <p class="excerpt">${escHtml(p.content)}</p>
        </div>
        <button class="btn btn-danger btn-sm delete-post-btn" title="Delete post" data-id="${p.id}">🗑</button>
      </div>
      <div class="post-card-meta">
        <span>👤 ${escHtml(p.author)}</span>
        <span>🕒 ${formatDate(p.created_at)}</span>
        ${p.comment_count > 0 ? `<span>💬 ${p.comment_count} comment${p.comment_count !== 1 ? 's' : ''}</span>` : ''}
        ${p.file_count > 0 ? `<span>📎 ${p.file_count} file${p.file_count !== 1 ? 's' : ''}</span>` : ''}
      </div>`;

    card.addEventListener('click', e => {
      if (e.target.closest('.delete-post-btn')) return;
      openDetail(p.id);
    });

    card.querySelector('.delete-post-btn').addEventListener('click', e => {
      e.stopPropagation();
      deletePost(p.id);
    });

    postList.appendChild(card);
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Category filter ───────────────────────────────── */
categoryItems.forEach(li => {
  li.addEventListener('click', () => {
    categoryItems.forEach(i => i.classList.remove('active'));
    li.classList.add('active');
    currentCategory = li.dataset.cat;
    loadPosts();
  });
});

/* ── Search ────────────────────────────────────────── */
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadPosts, 350);
});

/* ── New Post Modal ────────────────────────────────── */
function openNewPostModal() {
  newPostModal.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeNewPostModal() {
  newPostModal.hidden = true;
  document.body.style.overflow = '';
  newPostForm.reset();
  selectedFiles = [];
  renderFilePreview();
}

openNewPostBtn.addEventListener('click', openNewPostModal);
closeNewPost.addEventListener('click', closeNewPostModal);
cancelNewPost.addEventListener('click', closeNewPostModal);
newPostModal.addEventListener('click', e => { if (e.target === newPostModal) closeNewPostModal(); });

/* ── File drop zone ────────────────────────────────── */
fileDrop.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  addFiles(Array.from(fileInput.files));
  fileInput.value = '';
});

fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('drag-over'); });
fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
fileDrop.addEventListener('drop', e => {
  e.preventDefault();
  fileDrop.classList.remove('drag-over');
  addFiles(Array.from(e.dataTransfer.files));
});

function addFiles(newFiles) {
  newFiles.forEach(f => {
    if (!selectedFiles.find(sf => sf.name === f.name && sf.size === f.size)) {
      selectedFiles.push(f);
    }
  });
  renderFilePreview();
}

function renderFilePreview() {
  filePreview.innerHTML = '';
  selectedFiles.forEach((f, i) => {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.innerHTML = `${fileIcon(f.type)} <span>${escHtml(f.name)}</span> <span style="color:var(--muted)">(${formatBytes(f.size)})</span> <button type="button" title="Remove">×</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      selectedFiles.splice(i, 1);
      renderFilePreview();
    });
    filePreview.appendChild(chip);
  });
}

/* ── Submit new post ───────────────────────────────── */
newPostForm.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(newPostForm);
  // Replace files with selected ones (form input may be empty)
  fd.delete('files');
  selectedFiles.forEach(f => fd.append('files', f));

  try {
    const btn = newPostForm.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    await api('POST', '/api/posts', fd);
    closeNewPostModal();
    loadPosts();
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    const btn = newPostForm.querySelector('[type=submit]');
    if (btn) { btn.disabled = false; btn.textContent = 'Publish'; }
  }
});

/* ── Delete post ───────────────────────────────────── */
async function deletePost(id) {
  if (!confirm('Delete this post and all its attachments and comments?')) return;
  try {
    await api('DELETE', `/api/posts/${id}`);
    loadPosts();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

/* ── Detail Modal ──────────────────────────────────── */
async function openDetail(id) {
  try {
    const post = await api('GET', `/api/posts/${id}`);
    currentPostId = id;
    renderDetail(post);
    postDetailModal.hidden = false;
    document.body.style.overflow = 'hidden';
    postDetailModal.scrollTop = 0;
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function renderDetail(post) {
  detailCategory.textContent = post.category;
  detailCategory.className = `badge ${post.category}`;
  detailTitle.textContent = post.title;
  detailMeta.innerHTML = `<span>👤 ${escHtml(post.author)}</span><span>🕒 ${formatDate(post.created_at)}</span>`;
  detailContent.textContent = post.content;

  // Files
  if (post.files && post.files.length) {
    detailFiles.innerHTML = `<h3>📎 Attachments (${post.files.length})</h3>` +
      post.files.map(f => `
        <div class="file-list-item">
          <span>${fileIcon(f.mime_type)}</span>
          <a href="/api/files/${f.id}/download" download="${escHtml(f.original_name)}">${escHtml(f.original_name)}</a>
          <span class="file-size">${formatBytes(f.size)}</span>
        </div>`).join('');
  } else {
    detailFiles.innerHTML = '';
  }

  renderComments(post.comments || []);
}

function renderComments(comments) {
  commentCount.textContent = `(${comments.length})`;
  commentList.innerHTML = '';
  comments.forEach(c => {
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
      <div>
        <span class="comment-author">👤 ${escHtml(c.author)}</span>
        <span class="comment-time">${formatDate(c.created_at)}</span>
      </div>
      <p class="comment-body">${escHtml(c.content)}</p>
      <div class="comment-actions">
        <button class="btn btn-danger btn-sm" data-id="${c.id}">Delete</button>
      </div>`;
    div.querySelector('.btn-danger').addEventListener('click', () => deleteComment(c.id));
    commentList.appendChild(div);
  });
}

closeDetail.addEventListener('click', () => {
  postDetailModal.hidden = true;
  document.body.style.overflow = '';
  currentPostId = null;
});
postDetailModal.addEventListener('click', e => {
  if (e.target === postDetailModal) {
    postDetailModal.hidden = true;
    document.body.style.overflow = '';
    currentPostId = null;
  }
});

/* ── Submit comment ────────────────────────────────── */
commentForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentPostId) return;
  try {
    const btn = commentForm.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Posting…';
    await api('POST', `/api/posts/${currentPostId}/comments`, {
      author:  commentAuthor.value.trim(),
      content: commentContent.value.trim(),
    });
    commentForm.reset();
    // Refresh comments
    const post = await api('GET', `/api/posts/${currentPostId}`);
    renderComments(post.comments);
    loadPosts(); // refresh count
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    const btn = commentForm.querySelector('button');
    if (btn) { btn.disabled = false; btn.textContent = 'Post Comment'; }
  }
});

/* ── Delete comment ────────────────────────────────── */
async function deleteComment(id) {
  if (!confirm('Delete this comment?')) return;
  try {
    await api('DELETE', `/api/comments/${id}`);
    const post = await api('GET', `/api/posts/${currentPostId}`);
    renderComments(post.comments);
    loadPosts();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

/* ── Keyboard shortcuts ────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!newPostModal.hidden) closeNewPostModal();
    else if (!postDetailModal.hidden) {
      postDetailModal.hidden = true;
      document.body.style.overflow = '';
      currentPostId = null;
    }
  }
});

/* ── Init ──────────────────────────────────────────── */
loadPosts();
