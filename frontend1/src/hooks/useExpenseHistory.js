import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../api.js';
import { fromKobo } from '../utils.js';

function isKoboAmount(value) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isSafeInteger(Number(value))
    && Number(value) >= 0;
}

function convertExpenseFromKobo(expense) {
  return {
    ...expense,
    id: expense.expense_id || expense.id,
    total: fromKobo(expense.total),
    balances: expense.balances.map((item) => ({
      ...item,
      memberId: item.memberId || item.member_id || item.id,
      contributed: fromKobo(item.contributed ?? item.paid ?? item.amount_paid ?? item.amountPaid ?? 0),
      share: fromKobo(item.share ?? item.equalShare ?? item.equal_share ?? 0),
      balance: fromKobo(item.balance ?? item.netBalance ?? item.net_balance ?? 0),
    })),
    settlements: expense.settlements.map((item) => ({
      ...item,
      from: item.from || item.fromName || item.from_name,
      fromId: item.fromId || item.fromMemberId || item.from_member_id || item.from_memberId,
      to: item.to || item.toName || item.to_name,
      toId: item.toId || item.toMemberId || item.to_member_id || item.to_memberId,
      amount: fromKobo(item.amount ?? item.amountToPay ?? item.amount_to_pay ?? 0),
    })),
  };
}

function parseExpenseHistory(data) {
  if (!Array.isArray(data.expenses)) {
    throw new Error('The API response must include an expenses array.');
  }
  const invalidExpense = data.expenses.find((expense) => {
    if (!expense || typeof expense !== 'object') return true;
    return !isKoboAmount(expense.total)
      || Number(expense.total) === 0
      || !Array.isArray(expense.balances)
      || !Array.isArray(expense.settlements)
      || expense.balances.some((item) => !item || typeof item !== 'object')
      || expense.settlements.some((item) => !item || typeof item !== 'object');
  });
  if (invalidExpense) {
    const fields = Object.keys(invalidExpense).join(', ') || 'none';
    throw new Error(`Expense history item has an unsupported format. Received fields: ${fields}.`);
  }
  return data.expenses.map(convertExpenseFromKobo);
}

export default function useExpenseHistory({ groupId }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const latestRequest = useRef(0);
  const history = state?.groupId === groupId ? state.expenses : [];

  const refreshHistory = useCallback(async (id = groupId) => {
    if (!id) {
      latestRequest.current += 1;
      setState(null);
      setError('');
      return;
    }
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const data = await request(`/groups/${encodeURIComponent(id)}/expenses`, {
        method: 'GET',
      });
      if (requestId !== latestRequest.current) return false;
      setState({ groupId: id, expenses: parseExpenseHistory(data) });
      return true;
    } catch (err) {
      if (requestId === latestRequest.current) setError(err.message || 'Could not load expense history.');
      return false;
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    let active = true;
    if (!groupId) {
      latestRequest.current += 1;
      setState(null);
      setError('');
      return undefined;
    }

    const requestId = ++latestRequest.current;
    setLoading(true);
    setError('');
    request(`/groups/${encodeURIComponent(groupId)}/expenses`, {
      method: 'GET',
    })
      .then((data) => {
        if (active && requestId === latestRequest.current) {
          setState({ groupId, expenses: parseExpenseHistory(data) });
        }
      })
      .catch((err) => {
        if (active && requestId === latestRequest.current) setError(err.message || 'Could not load expense history.');
      })
      .finally(() => {
        if (active && requestId === latestRequest.current) setLoading(false);
      });

    return () => {
      active = false;
      if (requestId === latestRequest.current) latestRequest.current += 1;
    };
  }, [groupId]);

  return { history, loading, error, refreshHistory };
}
