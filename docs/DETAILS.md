# Exam Vault: details

## What is in the app
- **Sealed envelope.** The paper is shown as a sealed exam envelope. Its security tint is the real ciphertext.
- **Release panel.** Shows who may seal, who may open, and who holds the opening key right now. Each pending request has three signature seals that fill as board members sign.
- **Leak check.** Sits on top of the chain of custody. It states the minute before which nobody but the author could have read the paper, who signed the release, every refused attempt, and when the paper was opened. If a copy surfaces online earlier than that minute, it can only have come from the author.
- **Chain of custody.** A timeline per sitting. It merges the app's own log (sealed, opening refused, opened) with TideCloak's change requests: who asked, each signature with its time, the commit or the denial.
- **Server view.** Shows the full server record for the sitting: ciphertext and signed policies, no key and no plaintext.
- **Exam-room copy.** An opened paper carries a watermark with the holder's name and the time. **Present in exam room** shows it full screen.

## Implementation choices
- **Approvals stay in the browser.** Change requests are approved from the board member's own browser, with their DPoP-bound token (`IAMService.secureFetch`). They never go through the app server, so every signature belongs to a real person (`lib/tide/governance.ts`).
- **Policy and encryption code.** `lib/tide/relationship.ts` comes from the Tide agent pack's `RelationshipAttestation:1` template.
- **Two policies per sitting.** Sealing is authorised for the `lecturer` role and opening for the `invigilator` role. Holding the role is not enough: the caller also needs `_tide_encryptor` or `_tide_decryptor`. The board grants `_tide_decryptor` for the sitting and revokes it afterwards.
- **Storage.** A JSON file instead of a database, because the server only ever holds ciphertext and signed policies.
