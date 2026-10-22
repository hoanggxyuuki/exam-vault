[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

## Project overview

_Exam Vault removes unilateral release authority from exams: papers reach every centre early, and nobody, not even IT, can open one before the board signs._

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked).

### 1. Vision & originality
Coordination at scale without custody at scale. Exam Vault separates possession from access: anyone can carry a paper, because carrying it no longer means reading it. So papers go to every centre early, and rival universities can even share one exam bank, released by a board drawn from each. This is not an approval workflow, where approval is a flag whoever runs the server can flip. Here the board's signatures are the only way to open the paper.

### 2. Trust constraint insight
The problem is not storage; it is unilateral authority. Exam release fails whenever one person or system can act alone. NEET-UG 2024 ran at 4,750 centres, and its paper was taken from a trunk at one. In software, that person is whoever runs the server.

### 3. Value & impact
- **Boards** stop running a custody chain.
- **Centres** need no strong room or courier.
- **Candidates** stop paying for leaks and rumours: UGC-NET 2024 was cancelled for 900,000 people over a screenshot later found doctored.
- **Auditors** get a signed record of who could read each paper.

### 4. Why TideCloak matters
TideCloak makes release authority emerge only when 2 of 3 board members sign. The app server never holds a reusable opening key and cannot grant itself one.

### 5. Prototype & storytelling
The [2-minute demo](demo/exam-vault-demo.mp4) runs the live app. **Key moment (0:46):** Sam, the IT administrator, clicks Open and all 20 Tide nodes refuse; Sam's self-grant stalls. Then two board members release it to Minh, who opens a watermarked copy; the leak check shows only Hoa could read it earlier.

![Sealed paper](docs/app.png)

![Watermarked copy](docs/open.png)

![Leak check](docs/leak-check.png)

## Watch for this in the demo

| Time | What happens | Why it matters |
|---|---|---|
| 0:33 | Hoa seals the paper. **What the server holds** shows ciphertext, no key, no plaintext. | A breach of the server yields nothing readable. |
| **0:46** | **Sam, the IT administrator, clicks Open. 20 of 20 Tide nodes refuse. Sam asks for the key; the request stalls at 1 of 2 signatures.** | **Running the server and the identity system is not enough to open a paper.** |
| 1:05 | Hoa denies Sam's request and asks the board to release the paper to Minh. Two signatures commit it. | Opening authority emerges only from the quorum. |
| 1:21 | Minh, the Chief Invigilator, opens a watermarked copy. | Every copy names who opened it and when. |
| 1:29 | The leak check: before 11:06:37, nobody but Hoa could read the paper. | A leak rumour can be checked in seconds. |

## How it works: TideCloak vs the app

| | TideCloak enforces | Exam Vault (the app) does |
|---|---|---|
| **Sealing** | Encrypts the paper through the Tide network under a policy bound to one exam. No key is ever stored by the app. | Gives the examiner a sheet to write on and stores the ciphertext. |
| **Release** | The opening role (`_tide_decryptor`) can only be granted by a change request that 2 of 3 board members sign in their own Tide enclaves. The app server cannot manufacture it. | Shows who holds the key, collects requests, and lets each board member approve or deny. |
| **Opening** | The Tide nodes decrypt only when identity, role and policy line up. The authority emerges at that moment; nobody holds it in advance. | Shows the paper with a watermark naming the holder and the time. |
| **Proof** | Every grant carries board signatures with timestamps. | Turns them into the chain of custody and the leak check. |

What a breach gets: the server holds ciphertext and signed policies, no key and no plaintext. An administrator who controls the server and the identity system is refused by the network like anyone else, and their own request for the key stalls at 1 of 2 signatures.

## Setup

**Requirements:** Docker, Node.js 20+, `bash`, `curl`, `jq`, Chrome or Chromium.

1. **Start TideCloak** (dev image):
   ```bash
   docker run -d --name mytidecloak -p 8080:8080 \
     -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=password \
     tideorg/tidecloak-dev:latest
   ```
2. **Install:** `npm install`
3. **Create the realm and the three demo people:**
   ```bash
   NEW_REALM_NAME=examvault CLIENT_NAME=examvault-app \
   SUBSCRIPTION_EMAIL=you@example.edu TIDE_TERMS_ACCEPTED=yes \
   REALM_JSON_PATH=$PWD/init/realm.json bash init/tcinit.sh
   ```
   - The script prints an enrollment link for `admin` (Sam Vo, IT Administrator). It writes links for `examoffice` (Hoa Nguyen, Head of Examinations) and `invigilator` (Minh Pham, Chief Invigilator) to `init/.invite-links.txt`.
   - Open each link in its own browser profile and create a Tide account. The script waits until all three are linked, switches the realm to multi-admin governance, and writes `tidecloak.json`. That file holds public adapter config only. It is overwritten for your own realm.
4. **Run:** `npm run build && npm start` (or `npm run dev`), then open http://localhost:3000.
5. **Seat the board:** sign in as Sam.
   - Click **Seat Hoa Nguyen** and **Seat Minh Pham**, then approve each in the Tide window.
   - Approve the **Update the board's signing rule** request. The quorum becomes 2 of 3.
6. **Prepare a sitting:** use **Open a sitting** in the sidebar, then click **Authorise sealing** and **Authorise opening**. Then follow the story in the demo, using one browser profile per person.

**Notes**
- **Plan limit:** the free Tide plan allows 3 Tide accounts per realm. That is why the demo has three people, and all three sit on the board.
- **Local network prompt:** Chrome may ask whether `ork1.tideprotocol.com` can reach `localhost`. Allow it, or sign-in and approvals time out.
- **Data:** papers, signed policies and the app log live in `data/store.json`, which is gitignored. All people and papers are synthetic.
- **Limits:** once a paper is open, nothing stops a photo of the screen. The watermark names who opened it and when. Revoking the key stops future opening, not copies already made.

More detail: [threat model, what is in the app and implementation choices](docs/DETAILS.md).
