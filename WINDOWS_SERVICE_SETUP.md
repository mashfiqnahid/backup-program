# Windows Service Setup Guide

By default, PM2 runs within the active user session on Windows. When you sign out, Windows terminates all processes running in that session, which stops the backup daemon.

To ensure the backup service runs continuously whenever the server is powered on—regardless of user sign-in or sign-out status—you must configure PM2 to run as a native **Windows Service**.

---

## Prerequisites
- Node.js installed and available in system PATH.
- PM2 installed globally (`npm install -g pm2`).
- Administrative privileges on the Windows server.

---

## Step-by-Step Setup

### Step 1: Run the Automation Script
We have included a helper script [`setup-pm2-windows-service.ps1`](./setup-pm2-windows-service.ps1) to automate the installation of the Windows Service wrapper.

1. Open File Explorer and navigate to your project directory: `F:\backup-file-cleaner`.
2. Right-click [`setup-pm2-windows-service.ps1`](./setup-pm2-windows-service.ps1) and select **Run with PowerShell**.
3. Accept the Administrator prompt (UAC) if prompted.
4. The script will:
   - Configure a machine-wide `PM2_HOME` environment variable pointing to `C:\pm2` (ensuring the service daemon and your local user see the same PM2 instances).
   - Install the global `pm2-windows-service` package.
   - Install and start the Windows service (named `PM2`).

---

### Step 2: Register the Backup Program
Once the PM2 service is installed, you need to register the backup program under the service's process list.

1. Open a **NEW** PowerShell or Command Prompt window (a new window is required to load the updated `PM2_HOME` environment variable).
2. Navigate to your project directory:
   ```cmd
   cd F:\backup-file-cleaner
   ```
3. Start the backup process using the existing ecosystem configuration:
   ```cmd
   pm2 start ecosystem.config.js
   ```
4. **Save** the running PM2 processes so they are resurrected when the system boots:
   ```cmd
   pm2 save
   ```

---

## Management & Verification

- **Check Service Status**: 
  Open a command line and type `pm2 status`. Since `PM2_HOME` is set to `C:\pm2` globally, this will query the daemon running under the Windows Service.
- **View Backup Logs**: 
  Use `pm2 logs backup-file-cleaner` to monitor output logs in real-time.
- **Restarting the Service**:
  You can manage the underlying Windows Service using the standard Services console (`services.msc`) or via PowerShell:
  ```powershell
  # Restart service
  Restart-Service -Name "PM2"
  ```

---

## Success History Logs
The application includes a dedicated success history logger that records only successful backup runs.
- **Log Folder**: `F:\backup-file-cleaner\history_logs/`
- **Log File**: `success.log`
- **Retention**: Records are automatically pruned to keep only the last **7 days** of successful backup runs.

