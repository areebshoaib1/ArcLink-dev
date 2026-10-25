# ArcLink

ArcLink is an independent hackathon project. It is not affiliated with or endorsed by Circle or Arc.

ArcLink makes it easy to create and share payment links for seamless USDC payments on the Arc blockchain.

## Getting Started

### Prerequisites

Make sure you have [Bun](https://bun.sh/) installed before getting started.

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd ArcLink
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

## Tech Stack

- **Vite**: Development server and build tooling
- **Tailwind CSS**: Utility-first styling
- **Foundry**: Solidity smart contract development and testing
- **Bun**: JavaScript runtime and package manager

## License

MIT
