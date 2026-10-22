import { useEffect, useMemo, useState } from 'react';
import { request } from '../api.js';
import { calculateSuggestedPayments, convertSettlementFromKobo, MAX_KOBO, money, toKobo } from '../utils.js';

export default function useSettlement({ groupId, savedMembers, members, setError, setNotice, setLoading, setResults, onExpenseSaved }) {
  const [total, setTotal] = useState('');
  const [expenses, setExpenses] = useState({});
  const [description, setDescription] = useState('');

  useEffect(() => {
    setTotal('');
    setExpenses({});
    setDescription('');
    setResults(null);
  }, [groupId, setResults]);

  const enteredTotal = Number(total);
  const expenseSum = useMemo(
    () => members.reduce((sum, member) => sum + Number(expenses[member.rowKey] || 0), 0),
    [members, expenses],
  );
  const totalMatches = total !== '' && Number.isFinite(enteredTotal) && Math.abs(expenseSum - enteredTotal) < 0.005;
  const hasValidContributions = members.every((member) => {
    const amount = expenses[member.rowKey];
    return amount !== '' && amount !== undefined && Number.isFinite(Number(amount)) && Number(amount) >= 0;
  });
  async function calculateSettlement(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!groupId || savedMembers.length === 0) return setError('Create the group first.');
    if (total === '' || !Number.isFinite(enteredTotal) || enteredTotal <= 0) return setError('Enter a total greater than zero.');
    if (toKobo(enteredTotal) > MAX_KOBO) return setError('The total expense is too large.');
    if (!hasValidContributions) return setError('Enter a valid contribution (zero or more) for every member.');
    if (!totalMatches) {
      const message = `Your individual expenses add up to ${money(expenseSum)}, which does not match the total expense of ${money(enteredTotal)}. Please evaluate the expenses again.`;
      setError(message);
      window.alert(message);
      return;
    }

    const payload = {
      total: toKobo(enteredTotal),
      payments: savedMembers.map((member) => ({
        memberId: member.id,
        amountPaid: toKobo(expenses[member.rowKey]),
      })),
      ...(description.trim() ? { description: description.trim() } : {}),
    };

    setLoading(true);
    try {
      const response = await request(`/groups/${encodeURIComponent(groupId)}/expenses`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const result = convertSettlementFromKobo(response);
      result.settlements = calculateSuggestedPayments(payload.total, payload.payments, savedMembers);
      setResults(result);
      try {
        if (onExpenseSaved) await onExpenseSaved(groupId);
      } catch (err) {
        setError(`Expense saved, but the saved group data could not be refreshed. ${err.message}`);
        return;
      }
      setNotice('Expense calculated and saved. The settlement and group history are up to date.');
    } catch (err) {
      setError(err.message || 'Could not calculate the settlement.');
    } finally {
      setLoading(false);
    }
  }

  return {
    total, setTotal, expenses, setExpenses, description, setDescription,
    enteredTotal, expenseSum, totalMatches, hasValidContributions, calculateSettlement,
  };
}
