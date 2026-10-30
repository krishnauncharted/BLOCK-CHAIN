# MEDway frontend

The MEDway interface connects to the FastAPI service and Coral Testnet reservation
workflow from `../blockchain-main`. The Vite development server proxies `/api`
requests to `http://127.0.0.1:8000`, so the browser does not need a separate CORS
configuration.

## Run locally

1. Build the contract artifact and install the backend bridge dependencies:

   ```powershell
   cd ..\blockchain-main\contracts
   npm install
   npx hardhat build
   cd ..\backend
   npm install
   ```

2. Create and configure `backend\.env` with your own Coral relayer and institutional
   signing credentials. Keep this file local; never put private keys in the frontend.
   The frontend never bundles backend or blockchain signing credentials.
   Treat any signing keys or demo API credentials included in source documentation
   as exposed; replace them before using this project with real accounts.

3. Install and start the API:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

4. In another terminal, run the frontend:

   ```powershell
   cd ..\..\frontend-v2
   npm install
   npm run dev
   ```

   Open `http://127.0.0.1:5174`. The institution selector and optional API-key
   field set the actor headers expected by the backend; entered API keys are held
   only in browser `sessionStorage`.

The frontend includes capacity discovery, coordinator approval, provider acceptance
and fulfillment, dispute and arbitration actions, on-chain status inspection,
institution registry checks, and audit/evidence verification.

Run `npm run build` in this directory to type-check and create the production build.
