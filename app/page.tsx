'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTideCloak } from '@tidecloak/nextjs'
import { Logo } from './home/sidebar'
import { Flap } from './home/envelope'

const TINT =
  'AQAAAAEAAAAJyUZqyFBKzBg8xSgT3Bd9u8eJZxSkuK1oWv8w2kQeV4mN0rT5pLc7aGfH1sY3uE9oBbN6dR2wq8XjK4mP0tLs5vYc3eR7hG1nUoI9pW2aZxQ8bF6kD4jS1lM0rT7yV3uC5eN8gH2iJ6oK9pL1qA4sD7fG0hJ3kL6zX9cV2bN5mQ8wE1rT4yU7iO0pA3sD6fG9hJ2kL5zX8cV1bN4mQ7wE0rT3yU6iO9pA2sD5fG8hJ1kL4zX7cV0bN3mQ6wE9rT2yU5iO8pA1sD4fG7hJ0kL3zX6cV9bN2mQ5wE8rT1yU4iO7pA0sD3fG6hJ9kL2zX5cV8bN1mQ4wE7rT0yU3iO6pA9sD2fG5hJ8kL1zX4cV7bN0mQ3wE6rT9yU2iO5pA8sD1fG4hJ7kL0zX3cV6bN9mQ2wE5rT8yU1iO4pA7sD0fG3hJ6kL9zX2cV5bN8mQ1wE4rT7yU0iO3pA6sD9fG2hJ5kL8zX1cV4bN7mQ0wE3rT6yU9iO2pA5sD8fG1hJ4kL7zX0cV3bN6mQ9wE2rT5yU8iO1pA4sD7fG0hJ3kL6zX9cV2bN5mQ8wE1rT4yU7iO0pA3sD6fG9hJ2kL5zX8cV1bN4mQ7wE0rT3yU6iO9pA2sD5fG8hJ1kL4zX7cV0bN3mQ6wE9rT2yU5iO8pA1sD4fG7hJ0kL3zX6cV9bN2mQ5wE8rT1yU4iO7pA0sD3fG6hJ9kL2zX5cV8bN1mQ4wE7=='

const STEPS = [
  {
    title: 'Seal',
    text: 'The Head of Examinations writes the paper and seals it. The browser encrypts it through the Tide network, bound to that one exam, and it cannot be read back.',
  },
  {
    title: 'Release',
    text: 'On exam morning someone asks the board to release the paper. It commits only when two of the three board members sign it in their own Tide window.',
  },
  {
    title: 'Open',
    text: "The Chief Invigilator opens the paper in the room. The copy carries the invigilator's name and the time, and the board takes the key back after the exam.",
  },
]

export default function LandingPage() {
  const { login, authenticated, isInitializing } = useTideCloak()
  const router = useRouter()

  useEffect(() => {
    if (authenticated) router.push('/home')
  }, [authenticated, router])

  const signIn = (label: string, big: boolean) => (
    <button className={big ? 'btn big' : 'btn'} onClick={() => login()} disabled={isInitializing}>
      {isInitializing ? 'Connecting to TideCloak' : label}
    </button>
  )

  return (
    <div className="landing">
      <header className="land-top">
        <div className="land-brand">
          <Logo />
          <span>Exam Vault</span>
        </div>
        {signIn('Sign in', false)}
      </header>

      <section className="land-hero">
        <div className="land-copy">
          <h1>Exam papers nobody can leak alone.</h1>
          <p className="lede">
            Today, whoever runs the exam server can read the paper. Exam Vault seals each paper so that it opens only after two of three
            board members agree, and no one in the university holds the key. Not the examiner, not the board, not IT.
          </p>
          {signIn('Sign in with Tide', true)}
          <p className="land-note">A synthetic demo for the RMIT and Tide Unlocked hackathon. Built with TideCloak.</p>
        </div>

        <figure className="land-art" aria-label="A sealed exam paper waiting for two of three board signatures">
          <div className="env env-sealed hero-env">
            <div className="env-tint" aria-hidden="true">
              {TINT.repeat(4)}
            </div>
            <Flap />
            <div className="env-seal" aria-hidden="true">
              <span>COSC2536</span>
            </div>
            <div className="env-label">
              <p className="env-label-title">COSC2536 Security in Computing</p>
              <p>To be opened in the examination room by the Chief Invigilator only.</p>
            </div>
          </div>
          <ul className="seats hero-seats" aria-label="Board signatures">
            <li className="signed">
              <span className="wax">HN</span>
              <span className="seat-name">Hoa</span>
              <span className="seat-state">Signed</span>
            </li>
            <li className="signed">
              <span className="wax">SV</span>
              <span className="seat-name">Sam</span>
              <span className="seat-state">Signed</span>
            </li>
            <li>
              <span className="wax">MP</span>
              <span className="seat-name">Minh</span>
              <span className="seat-state">Not needed</span>
            </li>
          </ul>
          <figcaption>2 of 3 signatures. The paper can be released.</figcaption>
        </figure>
      </section>

      <section className="land-steps" aria-label="How it works">
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="step-n">{i + 1}</span>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="land-server">
        <div>
          <h2>What a breach of the server gets</h2>
          <p>
            The app server stores ciphertext and signed policies. There is no key on it and no plaintext. The IT administrator who runs it
            is refused by the Tide network like anyone else, and asking for the key only creates a request the rest of the board can deny.
          </p>
        </div>
        <pre aria-hidden="true">{`{
  "examId": "exam-cosc2536",
  "ciphertext": "${TINT.slice(0, 96)}...",
  "keys": "none",
  "plaintext": "none"
}`}</pre>
      </section>
    </div>
  )
}
