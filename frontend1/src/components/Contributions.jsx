import { money, normaliseName, sanitizeMoneyInput } from '../utils.js';

export default function Contributions({ groupId, hasSavedResult, total, setTotal, description, setDescription, members, expenses, setExpenses, expenseSum, totalMatches, enteredTotal, calculateSettlement, hasValidContributions, loading }) {
  return (
    <section className={`panel ${!groupId ? 'panel-muted' : ''}`}>
      <div className="panel-heading"><div><span className="section-index">02 / CONTRIBUTIONS</span><h2>Who paid what?</h2><p>Enter the amount each person contributed toward the shared cost.</p></div><div className="heading-icon">₦</div></div>
      {!groupId && <div className="locked-note">Create your group first to unlock contributions.</div>}
      <form onSubmit={calculateSettlement}>
        <div className="form-grid total-grid">
          <label className="field"><span>Total expense (₦) <b>*</b></span><div className="input-prefix"><span>₦</span><input type="text" inputMode="decimal" value={total} onChange={(e) => setTotal(sanitizeMoneyInput(e.target.value))} placeholder="0.00" disabled={!groupId || hasSavedResult} /></div></label>
          <label className="field"><span>Description <small>(optional)</small></span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Food and drinks" maxLength={120} disabled={!groupId || hasSavedResult} /></label>
        </div>
        <div className="contribution-list">
          {members.map((member, index) => <label className="contribution-row" key={member.rowKey}><span className="avatar">{(member.name.trim()[0] || '?').toUpperCase()}</span><span className="contribution-person"><b>{normaliseName(member.name) || `Person ${index + 1}`}</b></span><span className="amount-input"><span>₦</span><input type="text" inputMode="decimal" value={expenses[member.rowKey] ?? ''} onChange={(e) => setExpenses((previous) => ({ ...previous, [member.rowKey]: sanitizeMoneyInput(e.target.value) }))} placeholder="0.00" disabled={!groupId || hasSavedResult} /></span></label>)}
        </div>
        <div className={`sum-check ${total !== '' && !totalMatches ? 'sum-warning' : totalMatches ? 'sum-good' : ''}`}><div><span className="sum-label">CONTRIBUTIONS TOTAL</span><strong>{money(expenseSum)}</strong></div><div className="sum-status">{total === '' ? 'Enter your total above' : totalMatches ? '✓ Matches total expense' : `Difference: ${money(Math.abs(expenseSum - enteredTotal))}`}</div></div>
        {total !== '' && Number.isFinite(enteredTotal) && enteredTotal > 0 && hasValidContributions && !totalMatches && (
          <div className="alert alert-error" role="alert"><span>!</span><p>Your individual expenses add up to {money(expenseSum)}, which does not match the total expense of {money(enteredTotal)}. Please evaluate the expenses again.</p></div>
        )}
        <div className="panel-footer"><span className="privacy-note">Amounts must add up to the declared total.</span><button type="submit" className="button button-dark" disabled={!groupId || loading || hasSavedResult}>{loading ? 'Saving…' : hasSavedResult ? 'Expense saved' : 'Calculate & save expense'} <span>→</span></button></div>
      </form>
    </section>
  );
}
