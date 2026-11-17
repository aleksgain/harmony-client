import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { useSettingsStore } from '../../store/settingsStore';
import { Button } from '../common/Button';
import { ErrorNote } from '../common/EmptyState';

export function AccountPanel(): JSX.Element {
  const { settings, update, signOut } = useSettingsStore();
  const [email, setEmail] = useState(settings.auth?.email ?? '');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => api.login({ email, password }),
    onSuccess: async (res) => {
      setPassword('');
      await update({ auth: { token: res.token, accountId: res.accountId, email } });
    },
  });

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Account</h2>
      {settings.auth ? (
        <div className="flex items-center justify-between">
          <div className="text-sm">
            Signed in as <strong>{settings.auth.email}</strong>
            <span className="muted"> · account {settings.auth.accountId}</span>
          </div>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      ) : (
        <form className="grid grid-cols-[1fr_1fr_auto] gap-2" onSubmit={submit}>
          <input
            className="input"
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" variant="primary" loading={login.isPending} disabled={!settings.serverUrl}>
            Sign in
          </Button>
        </form>
      )}
      {!settings.serverUrl && <p className="muted text-xs">Configure a server first.</p>}
      <ErrorNote error={login.error} />
    </section>
  );
}
