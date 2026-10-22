import { useState } from 'react';
import { request } from '../api.js';
import { convertSettlementFromKobo, toKobo } from '../utils.js';

// Running balances for the current group: every saved expense and recorded payment added together.
export default function useLedger({ groupId, setError, setNotice, setLoading }) {
  const [state, setState] = useState(null);
  // Only show the ledger that belongs to the group currently on screen.
  const ledger = state && groupId && state.groupId === groupId ? state.data : null;

  // Report failures here and rethrow so save actions do not display false success.
  async function loadLedger(id = groupId) {
    if (!id) {
      setState(null);
      return;
    }
    try {
      const data = convertSettlementFromKobo(await request(`/groups/${id}/balances`));
      setState({ groupId: id, data });
    } catch (err) {
      setError(err.message || 'Could not load the running balances.');
      throw err;
    }
  }

  async function markPaid(payment) {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await request(`/groups/${groupId}/settlements`, {
        method: 'POST',
        body: JSON.stringify({
          fromId: payment.fromId,
          toId: payment.toId,
          amount: toKobo(payment.amount),
        }),
      });
      await loadLedger(groupId);
      setNotice(`Payment from ${payment.from} to ${payment.to} recorded.`);
    } catch (err) {
      setError(err.message || 'Could not record the payment.');
    } finally {
      setLoading(false);
    }
  }

  return { ledger, loadLedger, markPaid };
}
