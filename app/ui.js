const createForm = document.querySelector('#create');
const approveForm = document.querySelector('#approve');
const requestSection = document.querySelector('#request');
const errorNotice = document.querySelector('#error');
const approvalError = document.querySelector('#approval-error');
const approvalAttempt = document.querySelector('#approval-attempt');
const demoCodes = { standard: '123456', 'leading-zero': '042731' };
const submitButtons = document.querySelectorAll('form button');
let currentRequestId;

function formatApprovalTime(timestamp) {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(timestamp));

  return `${formatted} WIB`;
}

async function callApi(path, data) {
  const options = data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(result.error.message), {
      status: response.status,
      code: result.error.code,
    });
  }
  return result;
}

function renderRequest(record) {
  currentRequestId = record.id;
  const approved = record.status === 'approved';
  requestSection.dataset.status = record.status;
  document.querySelector('#request-heading').textContent = record.title;
  document.querySelector('#status').textContent = approved ? 'Status: Approved' : 'Status: Pending';
  approvalAttempt.hidden = true;
  approvalAttempt.textContent = '';
  document.querySelector('#approved-at').textContent = approved
    ? `Approved at: ${formatApprovalTime(record.approvedAt)}`
    : '';
  document.querySelector('#code-hint').textContent = `Demo code: ${demoCodes[record.fixture]}`;
  approveForm.reset();
  approveForm.hidden = approved;
  requestSection.hidden = false;
}

function showError(notice, error) {
  notice.textContent = error.message;
  notice.hidden = false;
  if (notice === approvalError) {
    document.querySelector('#code').setAttribute('aria-invalid', 'true');
  }
}

function bindForm(form, notice, fieldError, validateField, submit, callbacks = {}) {
  const requiredField = form.querySelector('[required]');

  function updateFieldError() {
    const message = validateField(requiredField.value);
    if (message) requiredField.setAttribute('aria-invalid', 'true');
    else requiredField.removeAttribute('aria-invalid');
    fieldError.textContent = message;
    fieldError.hidden = !message;
  }

  requiredField.addEventListener('input', () => {
    if (!fieldError.hidden) {
      fieldError.textContent = '';
      fieldError.hidden = true;
      requiredField.removeAttribute('aria-invalid');
    }
    if (notice !== fieldError) {
      notice.textContent = '';
      notice.hidden = true;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorNotice.hidden = true;
    errorNotice.textContent = '';
    notice.hidden = true;
    notice.textContent = '';
    updateFieldError();

    if (!fieldError.hidden) {
      requiredField.focus();
      callbacks.onInvalid?.();
      return;
    }

    for (const button of submitButtons) button.disabled = true;
    const button = form.querySelector('button');
    const originalLabel = button.textContent;
    button.textContent = button.dataset.loadingLabel;
    form.setAttribute('aria-busy', 'true');

    try {
      await submit(Object.fromEntries(new FormData(form)));
    } catch (error) {
      showError(notice, error);
      callbacks.onError?.(error);
    } finally {
      for (const button of submitButtons) button.disabled = false;
      button.textContent = originalLabel;
      form.removeAttribute('aria-busy');
    }
  });
}

bindForm(createForm, errorNotice, document.querySelector('#title-error'), (value) => {
  const title = value.trim();
  if (!title) return 'Enter a document title.';
  if (title.length > 80) return 'Document title must be 80 characters or fewer.';
  return '';
}, async (data) => {
  const record = await callApi('/api/requests', data);
  const url = new URL(window.location.href);
  url.searchParams.set('request', record.id);
  window.history.replaceState(null, '', url);
  renderRequest(record);
});

bindForm(approveForm, approvalError, approvalError, (value) => {
  if (!value.trim()) return 'Enter the approval code.';
  if (!/^[0-9]{6}$/.test(value)) return 'Enter exactly six digits (0-9).';
  return '';
}, async (data) => {
  const path = `/api/requests/${currentRequestId}`;
  let record;
  try {
    record = await callApi(`${path}/approve`, data);
  } catch (error) {
    if (error.status !== 409 || error.code !== 'ALREADY_APPROVED') throw error;
    record = await callApi(path);
  }
  renderRequest(record);
}, {
  onInvalid: () => {
    approvalAttempt.textContent = 'Last attempt: Failed';
    approvalAttempt.hidden = false;
  },
  onError: (error) => {
    if (error.code !== 'INCORRECT_CODE') return;
    approvalAttempt.textContent = 'Last attempt: Failed';
    approvalAttempt.hidden = false;
  },
});

const initialRequestId = new URLSearchParams(location.search).get('request');
if (/^\d+$/.test(initialRequestId ?? '')) {
  for (const button of submitButtons) button.disabled = true;
  try {
    renderRequest(await callApi(`/api/requests/${initialRequestId}`));
  } catch (error) {
    showError(errorNotice, error);
  } finally {
    for (const button of submitButtons) button.disabled = false;
  }
}
