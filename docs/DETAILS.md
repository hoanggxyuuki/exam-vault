# Exam Vault: details

## Threat model

What each attacker gets, in the prototype as built. "Board" means the 2-of-3 signers who can grant the opening key.

| Attacker | What they get | What stops the rest |
|---|---|---|
| Breached app server or database | Ciphertext, signed policies and the app log. No key, no plaintext. | Decryption happens in the Tide network. A paper is bound to its exam's tag, so ciphertext moved to another sitting does not open. |
| IT administrator who runs the server and TideCloak | Can stop the service or delete a paper. Cannot read one. | All 20 Tide nodes refuse to decrypt. A request to grant themselves the key becomes a change request that stalls at 1 of 2 signatures. |
| One board member | One signature. | The release needs 2 of 3, and every signature appears in the chain of custody. |
| Two colluding board members | Can release the paper to anyone. | Nothing, by design: this is the quorum. Their signatures and times are on the record. |
| Chief Invigilator after opening | Can photograph the screen. | The watermark names the holder and the time. Revoking the key stops future opening, not copies already made. |
| The paper's author | Knows the paper from the start. | The leak check narrows any leak before release to the author. |
| Someone who copies a signed-in user's access token | Nothing on another machine. | Tokens are DPoP-bound to a key held in the user's browser, so a copied token cannot be replayed elsewhere. Malware inside that browser can act as the user. |

**Known gaps**
- The app's own log (sealed, refused, opened) lives in `data/store.json` and is not signed. Release times come from TideCloak's change requests; the app shows them but does not verify the signatures itself.
- Availability is out of scope: whoever runs the server can withhold or delete a paper, but cannot read or forge one.
- The free Tide plan allows 3 accounts, so the IT administrator sits on the demo board. A real board would not include IT.

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
