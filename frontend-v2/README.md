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

   Open `http://127.0.0.1:5174`. The institution selector is checked against the
   backend `/session` endpoint before institution-specific actions are enabled;
   no API key is requested in the frontend.

The frontend includes capacity discovery, coordinator approval, temporary capacity
lock details, provider inventory updates and capacity checks, provider acceptance
and fulfillment, dispute and arbitration actions, on-chain status inspection,
institution registry checks, and audit/evidence verification.

The inventory and capacity-check controls require a deployed contract artifact with
the capacity inventory and lock functions used by the updated backend. If the
configured contract does not expose those functions, the backend reports the error
in the capacity network instead of showing an unsupported snapshot.
Coordinator approval also requires a configured Coral relayer; without one, the
proposal remains available and the UI reports that an on-chain reservation could not
be submitted.

Run `npm run build` in this directory to type-check and create the production build.
