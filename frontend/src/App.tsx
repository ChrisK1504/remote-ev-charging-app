import { useEffect, useState } from 'react'
import { request } from './api'
import type { Charger, CommandResponse } from './api'
import './App.css'

function ChargerControls({ charger }: { charger: Charger }) {
  const [idTag, setIdTag] = useState('')
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
    if (action === 'start' && !idTag.trim()) {
      setError('Enter an ID tag.')
      return
    }

    setBusy(true)
    setMessage('')
    setError('')
    const path = `/chargers/${encodeURIComponent(charger.id)}`
    try {
      const result = await request<CommandResponse>(
        action === 'start' ? `${path}/start` : `${path}/connector/${connector}/stop`,
        {
          method: 'POST',
          ...(action === 'start' ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idTag: idTag.trim(), connectorId: connector }),
          } : {}),
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
          <legend>Charging controls</legend>
          <label>
            Connector{' '}
            <input type="number" min="1" step="1" required value={connectorId}
              onChange={(event) => setConnectorId(event.target.value)} />
          </label>
          <label>
            ID tag{' '}
            <input required maxLength={20} value={idTag}
              onChange={(event) => setIdTag(event.target.value)} />
          </label>
          <button type="submit">Start</button>
          <button type="button" onClick={() => void send('stop')}>Stop</button>
        </fieldset>
      </form>
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

  useEffect(() => {
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
  }, [])

  return (
    <main>
      <h1>Chargers</h1>
      <p>{loading ? 'Loading…' : 'Updates every 2 seconds.'}</p>
      {error && <p role="alert">{error}</p>}
      {!loading && !error && chargers.length === 0 && <p>No chargers found.</p>}
      {chargers.map((charger) => (
        <section key={charger.id}>
          <h2>{charger.id}</h2>
          <p>{charger.connected ? 'Connected' : 'Disconnected'}</p>
          {charger.connectors.length === 0 ? <p>No connector state received yet.</p> : (
            <ul>
              {charger.connectors.map((connector) => (
                <li key={connector.connectorId}>
                  Connector {connector.connectorId}: {connector.status}
                  {connector.errorCode !== 'NoError' && ` (${connector.errorCode})`}
                  {' — '}{new Date(connector.updatedAt).toLocaleString()}
                  {connector.meterValue ? (
                    <div>
                      <p>
                        Latest readings: {new Date(connector.meterValue.timestamp).toLocaleString()}
                        {connector.transactionId !== undefined && ` · Transaction ${connector.transactionId}`}
                      </p>
                      <table>
                        <thead><tr><th>Measurement</th><th>Value</th></tr></thead>
                        <tbody>
                          {connector.meterValue.sampledValue.map((sample, index) => (
                            <tr key={index}>
                              <td>{sample.measurand ?? 'Reading'}{sample.phase && ` (${sample.phase})`}</td>
                              <td>{sample.value} {sample.unit ?? ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p>No meter readings yet.</p>}
                </li>
              ))}
            </ul>
          )}
          <ChargerControls charger={charger} />
        </section>
      ))}
    </main>
  )
}

export default App
