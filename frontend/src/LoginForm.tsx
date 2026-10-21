import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Zap, ArrowRight, ShieldCheck } from 'lucide-react'
import { useState } from "react"
import { request } from "./api";

export interface User {
    id: string
    email: string
}

export type LoginFormProps = {
    onLogin: (user: User) => void
}


function LoginForm({ onLogin }: LoginFormProps) {

    async function submitForm() {
        setBusy(true)
        setError('')

        try {
            const user = await request<{ id: string; email: string }>('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            })

            setPassword('')
            onLogin(user);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Login failed')
        } finally {
            setBusy(false)
        }
        
}
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    return (
        <main className="login-layout">
          <section className="login-story">
            <a className="brand" href="/"><span className="brand-mark"><Zap size={21} fill="currentColor" /></span> charge / control</a>
            <div><p className="eyebrow">CONNECTED. IN CONTROL.</p><h1>A clearer view of<br />every charge.</h1><p>Stay connected to your charging network.<br />Monitor stations. Manage charging. Keep moving.</p><div className="network-art" aria-hidden="true"><PlugIllustration /></div></div>
            <p className="story-footer"><ShieldCheck size={16} /> Your charging network, in one place.</p>
          </section>
          <section className="login-panel">
          <Card className="login-card">
            <CardHeader><p className="eyebrow">WELCOME BACK</p><CardTitle className="text-3xl">Sign in to Charge Control</CardTitle><CardDescription>Enter your account details to access your stations.</CardDescription></CardHeader>
            <CardContent>
            <form onSubmit={(event) => {
                event.preventDefault()
                void submitForm()
            }}>
                <label htmlFor="emailField">Email</label>
                <Input
                    id="emailField"
                    type="email"
                    autoComplete="username"
                    placeholder="you@company.com"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                />
                <label htmlFor="passwordField">Password</label>
                <Input
                    id="passwordField"
                    value={password}
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    onChange={(event) => setPassword(event.target.value)}
                />

                <Button type="submit" disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} />
                </Button>
            </form>

            {error && <p role="alert">{error}</p>}
            </CardContent>
          </Card>
          <p className="login-footnote">Need an account? Contact your platform administrator.</p>
          </section>
        </main>
    )
}

function PlugIllustration() {
    return <div className="charger-illustration"><Zap size={48} strokeWidth={1.5} /><span>EV CHARGING</span><div className="illustration-indicator" /><div className="illustration-cable" /></div>
}

export default LoginForm