# ArcLink

**Get paid in USDC with a link.** ArcLink is built for freelancers: create a payment link in seconds, send it to a client, and the client pays from any wallet. The USDC goes straight to your wallet.

> ArcLink is an independent hackathon project. It is not affiliated with or endorsed by Circle or Arc. Built on Arc. Arc is a trademark of Circle Internet Group, Inc. and/or its affiliates.

- **Live app (Arc mainnet):** https://arclinkpay.com (runs from the author's own machine, so it can be offline; see the video and the transaction below)
- **Smart contract (Arc mainnet):** [`0x4e576747FE8846D6F49600c41d5aA2f5aFd5E6EE`](https://explorer.arc.io/address/0x4e576747FE8846D6F49600c41d5aA2f5aFd5E6EE)
- **Example mainnet payment through the app and contract:** [`0x43cd44b2927cf641c8a9148b392adf5a4b943457eed6314b1d0ebbccccab8e85`](https://explorer.arc.io/tx/0x43cd44b2927cf641c8a9148b392adf5a4b943457eed6314b1d0ebbccccab8e85) (0.02 USDC)

## Why it is useful for freelancers

- **Direct:** USDC goes from the client's wallet to the freelancer's wallet. ArcLink never holds funds, and the contract takes no fee.
- **Fast and cheap:** a payment settles on Arc in about a second, for a network fee under one cent.
- **Single-use links:** each link can be paid once, and the payment is recorded onchain, so it cannot be paid twice or altered.
- **Your own dashboard:** sign in with your wallet to manage your payments in one place. You see your onchain USDC balance, the total received, how much is still pending, and how many links you have created. A **Received** tab lists every link you made (paid, or waiting for payment, with who paid and when), and a **Paid** tab lists what you have paid to others, each with its receipt. Only the wallet that owns the links can open its dashboard.
- **Professional:** both sides get a receipt, including a downloadable image. The freelancer can add a private client name that the payer never sees.
- **Safe by design:** the pay page trusts the server's saved amount and recipient, not the address bar, and the server confirms every payment onchain before marking it paid.

## How it works

1. A creator signs in with their wallet (a free signature, no transaction) and makes a payment link for a USDC amount, paid to their wallet.
2. The payer opens the link, approves exactly that amount of USDC, then calls `pay(linkId, recipient, amount)` on the ArcLinkPay contract.
3. The contract sends the USDC straight from the payer to the creator, marks the link as paid, and emits a `LinkPaid` event.
4. The server accepts a payment only if that event, emitted by the ArcLinkPay contract, shows the right link, recipient and amount, together with the matching USDC transfer in the same transaction. A link can be paid once.

## Smart contract

`contracts/ArcLinkPay.sol` is a non-custodial, single-use USDC payment-link contract. It holds no funds and has no owner, fees or upgrade path.

- `pay(linkId, recipient, amount)` pulls USDC from the caller to the recipient with `safeTransferFrom` and emits `LinkPaid(ref, payer, recipient, amount, linkId)`.
- `ref = keccak256(abi.encode(linkId, recipient, amount))`. Because the key includes all three values, nobody can block a real link by paying the same link id with different terms.
- Tests: `contracts/test/ArcLinkPay.t.sol` (17 tests, including a fuzz test).

| | Arc mainnet (chain 5042) | Arc Testnet (chain 5042002) |
|---|---|---|
| Contract | [`0x4e576747…E6EE`](https://explorer.arc.io/address/0x4e576747FE8846D6F49600c41d5aA2f5aFd5E6EE) | [`0x79c35c69…267a`](https://explorer.testnet.arc.io/address/0x79c35c69390454155b5e6127c17839433f5c267a) |
| Deploy transaction | [`0xdca1f06a…bf91`](https://explorer.arc.io/tx/0xdca1f06ae3b8d5d2d8304dca229ce47a742a936217cb60e7fa276ae68221bf91) | [`0xa1af3734…8071`](https://explorer.testnet.arc.io/tx/0xa1af3734b24fce929d95fbf69bc4a21c23b03d3359332af72afb46d814c58071) |

Built with Arc Studio: <ADD YOUR ARC STUDIO PROJECT LINK HERE>

## How this project was built

The contract and its tests were written and tested in Arc Studio, which also produced the Arc Testnet deployment. The Arc mainnet deployment was run with `arc-forge`, using the command Arc Studio provided. The frontend and server started from Arc Studio output and were extended by the author.

## Getting started

### Prerequisites

- [Bun](https://bun.sh/)
- [Foundry](https://book.getfoundry.sh/) (only to run the contract tests)

### Install and run

```bash
git clone https://github.com/areebshoaib1/ArcLink-dev.git
cd ArcLink-dev
bun install
cp .env.example .env
```

The app has two parts. Run each in its own terminal:

```bash
bun run server      # API and database on http://localhost:3001
bun run dev         # web app, follow the URL printed in the terminal
```

To switch between Arc Testnet and Arc mainnet, change `ARC_ACTIVE_CHAIN_ID` in `src/network.ts`. The contract address for each network is in `src/contract.ts`.

### Tests

```bash
bun run contracts:test    # Solidity tests (Foundry)
bun run test:security     # API security checks (start `bun run server` first)
```

## Tech stack

- **Frontend:** Vite, React, TypeScript, Tailwind CSS, wagmi, viem and ConnectKit
- **Backend:** Bun with SQLite
- **Contracts:** Solidity 0.8.28 and Foundry, with OpenZeppelin's SafeERC20
- **Network:** Arc (USDC is the gas token)

## Notes and limits

- Sign-in uses a wallet signature, so smart-contract wallets are not supported yet.
- The creator's display name is not verified.
- This is a hackathon project and has not been audited.

## License

MIT