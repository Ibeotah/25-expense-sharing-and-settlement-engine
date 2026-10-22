import { useEffect, useState } from 'react';
import HeaderIntro from './components/HeaderIntro.jsx';
import GroupSetup from './components/GroupSetup.jsx';
import Contributions from './components/Contributions.jsx';
import SettlementSummary from './components/SettlementSummary.jsx';
import RunningBalances from './components/RunningBalances.jsx';
import ExpenseHistory from './components/ExpenseHistory.jsx';
import Login from './components/Login.jsx';
import { supabase, supabaseConfigured } from './api.js';
import useGroupSetup from './hooks/useGroupSetup.js';
import useLedger from './hooks/useLedger.js';
import useSettlement from './hooks/useSettlement.js';
import useExpenseHistory from './hooks/useExpenseHistory.js';

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [expenses, setExpenses] = useState({});
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAuthUser(session?.user || null);
      setAuthLoading(false);
      setAuthError('');
    });

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setAuthError(sessionError.message);
      } else {
        setAuthUser(data.session?.user || null);
      }
      setAuthLoading(false);
    }).catch((error) => {
      if (!active) return;
      setAuthError(error.message || 'Could not check your sign-in session.');
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const group = useGroupSetup({ ownerId: authUser?.id, setExpenses, setResults, setError, setNotice, setLoading });
  const ledger = useLedger({ groupId: group.groupId, setError, setNotice, setLoading });
  const expenseHistory = useExpenseHistory({ groupId: group.groupId });
  const settlement = useSettlement({
    onExpenseSaved: async (groupId) => {
      const [ledgerResult, historyRefreshed] = await Promise.all([
        ledger.loadLedger(groupId),
        expenseHistory.refreshHistory(groupId),
      ]);
      if (!historyRefreshed) throw new Error('The expense history could not be refreshed.');
      return ledgerResult;
    },
    groupId: group.groupId,
    savedMembers: group.savedMembers,
    members: group.members,
    setError,
    setNotice,
    setLoading,
    setResults,
  });
  const balances = results?.balances || results?.members || [];
  const settlements = results?.settlements || results?.suggestedPayments || [];

  if (authLoading) {
    return <main className="login-screen"><p role="status">Checking your sign-in session…</p></main>;
  }

  if (!supabaseConfigured) {
    return (
      <main className="login-screen">
        <section className="login-card" role="alert">
          <span className="section-index">SUPABASE SETUP REQUIRED</span>
          <h1>Connect your Supabase project.</h1>
          <p className="login-description">
            Create <code>frontend/.env.local</code> with <code>VITE_SUPABASE_URL</code> and
            {' '}<code>VITE_SUPABASE_ANON_KEY</code> from your Supabase project, then restart
            the development server.
          </p>
        </section>
      </main>
    );
  }

  if (!authUser) {
    return <Login onLogin={setAuthUser} authError={authError} />;
  }

  async function signOut() {
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      window.location.reload();
    } catch (error) {
      setError(error.message || 'Could not sign out.');
    }
  }
    
  return (
    <div className="app-shell">
      <HeaderIntro groupId={group.groupId} results={results} onLogout={signOut}>
        {(error || notice) && <div className={`alert ${error ? 'alert-error' : 'alert-success'}`} role={error ? 'alert' : 'status'}><span>{error ? '!' : '✓'}</span><p>{error || notice}</p><button onClick={() => { setError(''); setNotice(''); }} aria-label="Dismiss message">×</button></div>}

        <GroupSetup
          groupName={group.groupName}
          updateGroupName={group.updateGroupName}
          peopleCount={group.peopleCount}
          updateCount={group.updateCount}
          validPeopleCount={group.validPeopleCount}
          members={group.members}
          updateMember={group.updateMember}
          createGroup={group.createGroup}
          loading={loading}
        />

        <Contributions
          groupId={group.groupId}
          hasSavedResult={Boolean(results)}
          total={settlement.total}
          setTotal={settlement.setTotal}
          description={settlement.description}
          setDescription={settlement.setDescription}
          members={group.members}
          expenses={settlement.expenses}
          setExpenses={settlement.setExpenses}
          expenseSum={settlement.expenseSum}
          totalMatches={settlement.totalMatches}
          enteredTotal={settlement.enteredTotal}
          calculateSettlement={settlement.calculateSettlement}
          hasValidContributions={settlement.hasValidContributions}
          loading={loading}
        />

        <SettlementSummary
          results={results}
          balances={balances}
          settlements={settlements}
          savedMembers={group.savedMembers}
          enteredTotal={settlement.enteredTotal}
          groupName={group.groupName}
          setResults={setResults}
          setNotice={setNotice}
        />

        {group.groupId && <ExpenseHistory
          history={expenseHistory.history}
          loading={expenseHistory.loading}
          error={expenseHistory.error}
          groupName={group.groupName}
          members={group.savedMembers}
          onRefresh={() => expenseHistory.refreshHistory()}
        />}

        <RunningBalances
          ledger={ledger.ledger}
          groupName={group.groupName}
          members={group.savedMembers}
          onMarkPaid={ledger.markPaid}
          loading={loading}
        />

        <footer className="footer"><span>settle<span className="brand-dot">.</span></span><p>Clear contributions. Fair settlements. Better group spending.</p><small>Expense Sharing &amp; Settlement Engine · MVP</small></footer>
      </HeaderIntro>
    </div>
  );
}

export default App;
