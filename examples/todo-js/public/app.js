import USP from '/usp/index.js';

// Initialize USP Client
const client = await USP.initClient({ baseUrl: '/api/usp' });
const todosState = USP.useUsp('todos');

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const countEl = document.getElementById('task-count');
const clearBtn = document.getElementById('clear-completed');

function render() {
  list.innerHTML = '';
  const target = todosState.__target || todosState;
  const keys = Object.keys(target);

  let activeCount = 0;

  if (keys.length === 0) {
    list.innerHTML = '<div class="empty-state">No tasks yet. Add one above!</div>';
    countEl.textContent = '0 items remaining';
    return;
  }

  keys.forEach(key => {
    const item = target[key];
    if (!item) return;

    if (!item.completed) activeCount++;

    const li = document.createElement('li');
    li.className = `todo-item ${item.completed ? 'completed' : ''}`;
    
    li.innerHTML = `
      <div class="todo-content">
        <input type="checkbox" class="checkbox" ${item.completed ? 'checked' : ''}>
        <span class="todo-text">${escapeHtml(item.title)}</span>
      </div>
      <button class="delete-btn" aria-label="Delete todo">&times;</button>
    `;

    // Toggle completed status
    const checkbox = li.querySelector('.checkbox');
    checkbox.addEventListener('change', () => {
      todosState[key] = { ...item, completed: checkbox.checked };
    });

    // Delete item
    const deleteBtn = li.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => {
      delete todosState[key];
    });

    list.appendChild(li);
  });

  countEl.textContent = `${activeCount} item${activeCount === 1 ? '' : 's'} remaining`;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// React to USP sync events from server/other clients
USP.onSync(() => {
  render();
});

// Form submit -> Add Todo
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;

  const id = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  todosState[id] = { id, title, completed: false };

  input.value = '';
  render();
});

// Clear completed button -> Zero-Payload EXEC Trigger
clearBtn.addEventListener('click', () => {
  client.exec('todos', 'clearCompleted', () => {
    console.log('[USP Client] Clear completed action triggered via EXEC');
  });
});

// Initial render
render();
