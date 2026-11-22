const createForm = document.querySelector('#create');
const approveForm = document.querySelector('#approve');
const requestSection = document.querySelector('#request');
const errorNotice = document.querySelector('#error');
const approvalError = document.querySelector('#approval-error');
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
  document.querySelector('#request-heading').textContent = record.title;
  document.querySelector('#status').textContent = approved ? 'Status: Approved' : 'Status: Pending';
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
}

function bindForm(form, notice, submit) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorNotice.hidden = true;
    approvalError.hidden = true;
    approvalError.textContent = '';
    for (const button of submitButtons) button.disabled = true;

    try {
      await submit(Object.fromEntries(new FormData(form)));
    } catch (error) {
      showError(notice, error);
    } finally {
      for (const button of submitButtons) button.disabled = false;
    }
  });
}

bindForm(createForm, errorNotice, async (data) => {
  const record = await callApi('/api/requests', data);
  const url = new URL(window.location.href);
  url.searchParams.set('request', record.id);
  window.history.replaceState(null, '', url);
  renderRequest(record);
});

bindForm(approveForm, approvalError, async (data) => {
  const path = `/api/requests/${currentRequestId}`;
  let record;
  try {
    record = await callApi(`${path}/approve`, data);
  } catch (error) {
    if (error.status !== 409 || error.code !== 'ALREADY_APPROVED') throw error;
    record = await callApi(path);
  }
  renderRequest(record);
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
