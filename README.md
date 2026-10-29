# ArcLink

ArcLink is an independent hackathon project. It is not affiliated with or endorsed by Circle or Arc.

ArcLink makes it easy to create and share payment links for seamless USDC payments on the Arc blockchain.

## How it works

1. A creator makes a payment link for a USDC amount, paid to their wallet.
2. The payer approves exactly that amount, then calls `pay(linkId, recipient, amount)` on the ArcLinkPay contract.
3. The contract sends the USDC straight from the payer to the creator, marks the link as paid, and emits a `LinkPaid` event.
4. The server accepts a payment only if that event shows the right link, recipient and amount. A link can be paid once.

## Smart contract (built with Arc Studio)

- Contract: `contracts/ArcLinkPay.sol`, a non-custodial, single-use USDC payment-link contract. It holds no funds, and has no owner, fees or upgrade path.
- Tests: `contracts/test/ArcLinkPay.t.sol` (17 tests, including a fuzz test)
- Built, tested and deployed with Arc Studio: <Arc Studio project link>
- Arc Testnet: `0x79c35c69390454155b5e6127c17839433f5c267a`
- Arc Mainnet: <address, after you deploy>
- Example mainnet payment: <tx hash and explorer link, after your payment>

The contract was written, tested and deployed in Arc Studio. The app in this repo (frontend and server) was assembled manually from Arc Studio output.

## Getting Started

### Prerequisites

Make sure you have [Bun](https://bun.sh/) installed before getting started.

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/areebshoaib1/ArcLink-dev.git
   cd ArcLink-dev
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Configure environment variables**

   Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   Open `.env` and configure the required environment variables.

4. **Start the development server**

   ```bash
   bun run dev
   ```

   Follow the URL printed in your terminal to open the application.

### Contract tests

```bash
bun run contracts:test
```

## Tech Stack

- **Vite**: Development server and build tooling
- **Tailwind CSS**: Utility-first styling
- **Foundry**: Solidity smart contract development and testing
- **Bun**: JavaScript runtime and package manager

## License

MIT