import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { IBM_Plex_Sans, IBM_Plex_Mono, Source_Serif_4 } from 'next/font/google'
import { TideCloakProvider } from '@tidecloak/nextjs'
import tcConfig from '../tidecloak.json'
import './globals.css'

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' })
const serif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-serif' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Exam Vault',
  description: 'Exam papers nobody can leak alone. Built with TideCloak.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <TideCloakProvider config={{ ...tcConfig, useDPoP: { mode: 'strict', alg: 'ES256' } }}>{children}</TideCloakProvider>
      </body>
    </html>
  )
}
