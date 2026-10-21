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
        <div>
            <form onSubmit={(event) => {
                event.preventDefault()
                void submitForm()
            }}>
                <label htmlFor="emailField">Email</label>
                <input
                    id="emailField"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                />
                <label htmlFor="passwordField">Password</label>
                <input
                    id="passwordField"
                    value={password}
                    type="password"
                    required
                    onChange={(event) => setPassword(event.target.value)}
                />

                <button type="submit" disabled={busy}>
                    {busy ? 'Logging in...' : 'Log in'}
                </button>
            </form>

            {error && <p role="alert">{error}</p>}
        </div>
    )
}

export default LoginForm