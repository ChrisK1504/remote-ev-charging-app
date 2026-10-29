import { useEffect, useState } from 'react'
import { ApiError, request } from './api'
import type { Charger, CommandResponse } from './api'
import './App.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table'
import { Zap, PlugZap, Radio, LogOut, Activity } from 'lucide-react'
import LoginForm, { type User } from './LoginForm'

function ChargerControls({ charger }: { charger: Charger }) {
  const [connectorId, setConnectorId] = useState('1')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  

  async function send(action: 'start' | 'stop') {
    const connector = Number(connectorId)
    if (!Number.isSafeInteger(connector) || connector < 1) {
      setError('Enter a positive connector number.')
      return
    }

    setBusy(true)
    setMessage('')
    setError('')
    const path = `/chargers/${encodeURIComponent(charger.id)}/connector/${encodeURIComponent(connector)}`
    try {
      const result = await request<CommandResponse>(
        action === 'start' ? `${path}/start` : `${path}/stop`,
        {
          method: 'POST',
        },
      )
      setMessage(`${action === 'start' ? 'Start' : 'Stop'} request: ${result.status}.`)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Request failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form onSubmit={(event) => { event.preventDefault(); void send('start') }}>
        <fieldset disabled={!charger.connected || busy}>
          <legend>Remote controls</legend>
          <label>
            Connector{' '}
            <Input type="number" min="1" step="1" required value={connectorId}
              onChange={(event) => setConnectorId(event.target.value)} />
          </label>
          <Button type="submit"><Zap size={15} /> Start charging</Button>
          <Button variant="outline" type="button" onClick={() => void send('stop')}>Stop charging</Button>
        </fieldset>
      </form>
      <p className="control-note">Command acceptance does not confirm charging. Check the reported connector status.</p>
      {busy && <p role="status">Waiting for charger…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </>
  )
}

function App() {
  const [chargers, setChargers] = useState<Charger[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [user, setUser] = useState<User | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [sessionError, setSessionError] = useState('')

  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  async function logout() {
    setLoggingOut(true)
    setLogoutError('')

    try {
      await request<void>('/auth/logout', {
        method: 'POST',
      });

      setUser(null);
      setChargers([]);
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Logout failed')
    } finally {
      setLoggingOut(false)
    }
  }

  useEffect(() => {
    // Allows rejecting pending requests when performing cleanup or a component unmounts
    const controller = new AbortController()

    async function restoreSession() {
      try {
        const currentUser = await request<User>('/auth/me', {
          signal: controller.signal,
        })

        if (!controller.signal.aborted) {
          setUser(currentUser)
        }
      } catch (error) {
        if (controller.signal.aborted) return

        if (error instanceof ApiError && error.status === 401) {
          setUser(null)
        } else {
          setSessionError('Could not check your session. Please retry');
        }
      } finally {
        if (!controller.signal.aborted) {
          setCheckingSession(false)
        }
      }
    }
    void restoreSession()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    let pending = false

    async function refresh() {
      if (pending) return
      pending = true
      try {
        const data = await request<Charger[]>('/chargers', { signal: controller.signal })
        if (!controller.signal.aborted) {
          setChargers(data)
          setError('')
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : 'Could not load chargers.')
        }
      } finally {
        pending = false
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void refresh()
    const interval = setInterval(() => void refresh(), 2000)
    return () => {
      clearInterval(interval)
      controller.abort()
    }
  }, [user])

  if (checkingSession) {
    return <main className="session-state"><Zap className="brand-mark" /><p role='status'>Checking your session…</p></main>
  }

  if (sessionError) {
    return (
      <main className='session-state' role='alert'>
        <p>{sessionError}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </main>
    )
  }

  if (!user) {
    return <LoginForm onLogin={setUser} />
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark"><Zap size={21} fill="currentColor" /></span> charge<span className="brand-light"> / control</span></a>
        <div className="account"><span>{user.email}</span><Button variant="outline" size="sm" disabled={loggingOut} onClick={() => void logout()}><LogOut size={14} />{loggingOut ? 'Logging out…' : 'Log out'}</Button></div>
      </header>
      <div className="page-heading"><div><p className="eyebrow">CHARGING NETWORK</p><h1>Your charging stations</h1><p className="muted">Monitor connectors and manage charging from one place.</p></div><Badge variant="outline"><Radio size={13} /> {error ? 'Updates interrupted' : loading ? 'Connecting…' : 'Polling every 2s'}</Badge></div>
      <div className="stats-grid">
        <Card><CardContent className="stat"><span className="stat-icon"><PlugZap size={20} /></span><div><p className="muted">Known stations</p><strong>{loading ? '—' : chargers.length}</strong></div></CardContent></Card>
        <Card><CardContent className="stat"><span className="stat-icon green"><Radio size={20} /></span><div><p className="muted">Connected</p><strong>{loading ? '—' : chargers.filter(c => c.connected).length}</strong></div></CardContent></Card>
        <Card><CardContent className="stat"><span className="stat-icon"><Activity size={20} /></span><div><p className="muted">Reporting charging</p><strong>{loading ? '—' : chargers.flatMap(c => c.connectors).filter(c => c.status === 'Charging').length}</strong></div></CardContent></Card>
      </div>
      {loading && <p role="status" className="empty-state">Loading your charging stations…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && chargers.length === 0 && <Card className="empty-state"><PlugZap size={32} /><h2>No stations yet</h2><p className="muted">Stations will appear here when they connect to the backend.</p></Card>}
      {chargers.map((charger) => (
        <Card key={charger.id} className="charger-card">
          <CardHeader className="station-heading"><div><CardDescription>CHARGING STATION</CardDescription><CardTitle>{charger.id}</CardTitle></div><Badge variant="outline" className={charger.connected ? 'status-online' : 'status-offline'}><span className="status-dot" />{charger.connected ? 'Connected' : 'Disconnected'}</Badge></CardHeader>
          <CardContent>
          {charger.connectors.length === 0 ? <p>No connector state received yet.</p> : (
            <ul className="connector-list">
              {charger.connectors.map((connector) => (
                <li className="connector" key={connector.connectorId}>
                  <div className="connector-heading"><strong>Connector {connector.connectorId}</strong><Badge variant="secondary">{connector.status}</Badge></div>
                  {connector.errorCode !== 'NoError' && ` (${connector.errorCode})`}
                  <p className="timestamp">Status updated {new Date(connector.updatedAt).toLocaleString()}</p>
                  {connector.meterValue ? (
                    <div>
                      <p>
                        Latest readings: {new Date(connector.meterValue.timestamp).toLocaleString()}
                        {connector.transactionId !== undefined && ` · Transaction ${connector.transactionId}`}
                      </p>
                      <Table>
                        <TableHeader><TableRow><TableHead>Measurement</TableHead><TableHead>Value</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {connector.meterValue.sampledValue.map((sample, index) => (
                            <TableRow key={index}>
                              <TableCell>{sample.measurand ?? 'Reading'}{sample.phase && ` (${sample.phase})`}</TableCell>
                              <TableCell>{sample.value} {sample.unit ?? ''}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : <p>No meter readings yet.</p>}
                </li>
              ))}
            </ul>
          )}
          <ChargerControls charger={charger} />
          </CardContent>
        </Card>
      ))}
      <footer className="dashboard-footer">Charge Control <span>OCPP 1.6J · Station monitoring</span></footer>
      {logoutError && <p role='alert'>{logoutError}</p>}
    </main>
  )
}

export default App
