# Merchant Endpoint Flow Documentation

## 1. User Authentication Endpoints

### 1.1. User Registration
- **Endpoint:** `POST /auth/register`
- **Description:** Creates a new user account
- **Parameters:**
    - **Body (JSON):**
        ```json
        {
            "name": "Full Name",
            "email": "user@example.com",
            "password": "password123"
        }
        ```
- **Successful Response (201 Created):**
    ```json
    {
        "id": 1,
        "name": "Full Name",
        "email": "user@example.com",
        "createdAt": "2025-03-12T04:02:01.021Z",
        "updatedAt": "2025-03-12T04:02:01.021Z"
    }
    ```
- **Error Response (400 Bad Request):**
    ```json
    {
        "message": "Email already registered"
    }
    ```

### 1.2. Login
- **Endpoint:** `POST /auth/login`
- **Description:** Authenticates a user and generates JWT tokens
- **Parameters:**
    - **Body (JSON):**
        ```json
        {
            "email": "user@example.com",
            "password": "password123"
        }
        ```
- **Successful Response (200 OK):**
    ```json
    {
        "user": {
            "id": 1,
            "name": "Full Name",
            "email": "user@example.com",
            "createdAt": "2025-03-12T04:02:01.021Z",
            "updatedAt": "2025-03-12T04:02:01.021Z"
        },
        "tokens": {
            "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        }
    }
    ```
- **Error Responses:**
    - **401 Unauthorized:**
        ```json
        {
            "message": "Invalid email or password"
        }
        ```
    - **403 Forbidden (2FA enabled):**
        ```json
        {
            "message": "2FA is enabled. Please use /login-2fa instead."
        }
        ```

### 1.3. Refresh Token
- **Endpoint:** `POST /auth/refresh-token`
- **Description:** Generates new JWT tokens using a refresh token
- **Parameters:**
    - **Body (JSON):**
        ```json
        {
            "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        }
        ```
- **Successful Response (200 OK):**
    ```json
    {
        "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
    ```
- **Error Response (401 Unauthorized):**
    ```json
    {
        "message": "Invalid refresh token"
    }
    ```

### 1.4. Get Profile
- **Endpoint:** `GET /auth/profile`
- **Description:** Retrieves the current user's profile information
- **Headers:**
    - `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Successful Response (200 OK):**
    ```json
    {
        "id": 1,
        "name": "Full Name",
        "email": "user@example.com",
        "createdAt": "2025-03-12T04:02:01.021Z",
        "updatedAt": "2025-03-12T04:02:01.021Z"
    }
    ```
- **Error Response (401 Unauthorized):**
    ```json
    {
        "message": "Unauthorized"
    }
    ```

## 2. System Health Endpoints

### 2.1. General Health Check
- **Endpoint:** `GET /health`
- **Description:** Checks if the API is functioning correctly
- **Successful Response (200 OK):**
    ```json
    {
        "status": "ok",
        "timestamp": "2025-03-12T05:18:38.123Z",
        "version": "1.0.0"
    }
    ```

### 2.2. Database Health Check
- **Endpoint:** `GET /health/db`
- **Description:** Checks the connection to the database
- **Successful Response (200 OK):**
    ```json
    {
        "status": "ok",
        "timestamp": "2025-03-12T05:19:21.921Z",
        "responseTime": 18
    }
    ```
- **Error Response (503 Service Unavailable):**
    ```json
    {
        "status": "error",
        "message": "Database connection failed"
    }
    ```

### 2.3. Dependencies Health Check
- **Endpoint:** `GET /health/dependencies`
- **Description:** Checks the connection to external services (Redis, etc.)
- **Successful Response (200 OK):**
    ```json
    {
        "status": "ok",
        "dependencies": {
            "redis": "connected",
            "cache": "connected"
        },
        "timestamp": "2025-03-12T05:18:59.859Z",
        "responseTime": 1127
    }
    ```
- **Error Response (503 Service Unavailable):**
    ```json
    {
        "status": "error",
        "dependencies": {
            "redis": "disconnected",
            "cache": "connected"
        }
    }
    }
    ```

## 3. Two-Factor Authentication (2FA) Endpoints

### 3.1. Enable 2FA
- **Endpoint:** `POST /auth/enable-2fa`
- **Description:** Generates a QR code to set up 2FA
- **Headers:**
    - `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Successful Response (200 OK):**
    ```json
    {
        "qrCode": "otpauth://totp/Paystell:user@example.com?secret=ABCDEFGHIJKLMNOP&issuer=Paystell",
        "secret": "ABCDEFGHIJKLMNOP"
    }
    ```
- **Complete Flow:**
    1. User logs in normally (`/auth/login`)
    2. User requests to enable 2FA (`/auth/enable-2fa`)
    3. Backend generates a unique secret and returns a QR code
    4. User scans the QR code with an app like Google Authenticator
    5. User uses the code generated in the app to verify setup (`/auth/verify-2fa`)

### 3.2. Verify 2FA Setup
- **Endpoint:** `POST /auth/verify-2fa`
- **Description:** Verifies that the 2FA setup works correctly
- **Headers:**
    - `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Parameters:**
    - **Body (JSON):**
        ```json
        {
            "token": "123456"
        }
        ```
- **Successful Response (200 OK):**
    ```json
    {
        "success": true,
        "message": "2FA verification successful"
    }
    ```
- **Error Response (400 Bad Request):**
    ```json
    {
        "message": "Invalid 2FA token"
    }
    ```

### 3.3. Login with 2FA
- **Endpoint:** `POST /auth/login-2fa`
- **Description:** Authenticates a user with credentials + 2FA code
- **Parameters:**
    - **Body (JSON):**
        ```json
        {
            "email": "user@example.com",
            "password": "password123",
            "token": "123456"
        }
        ```
- **Successful Response (200 OK):** *(same as `/auth/login`)*
- **Error Response (401 Unauthorized):**
    ```json
    {
        "message": "Invalid 2FA token"
    }
    ```
- **Complete Flow:**
    1. User tries to log in normally (`/auth/login`)
    2. If 2FA is enabled, receives a 403 with the message
    3. User sends credentials + 2FA code to `/auth/login-2fa`
    4. Backend verifies both credentials and 2FA code
    5. If everything is correct, receives JWT tokens as in normal login

### 3.4. Disable 2FA
- **Endpoint:** `POST /auth/disable-2fa`
- **Description:** Disables two-factor authentication
- **Headers:**
    - `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Successful Response (200 OK):**
    ```json
    {
        "message": "2FA disabled successfully"
    }
    ```
- **Error Response (400 Bad Request):**
    ```json
    {
        "message": "2FA is not enabled for this user"
    }
    ```

## 4. Merchant Profile Management Endpoints

### 4.1. Get Merchant Profile
- **Endpoint:** `GET /merchants/profile`
- **Description:** Retrieves the merchant's business profile information
- **Headers:**
    - `x-api-key: your-merchant-api-key`
- **Successful Response (200 OK):**
    ```json
    {
        "business_name": "My Business",
        "business_email": "business@example.com",
        "business_description": "Business description",
        "business_address": "123 Business St",
        "business_phone": "+1234567890",
        "business_logo_url": "http://example.com/logos/business-logo.jpg"
    }
    ```
- **Error Responses:**
    - **401 Unauthorized:**
        ```json
        {
            "error": "API key is required"
        }
        ```
    - **404 Not Found:**
        ```json
        {
            "error": "Merchant not found"
        }
        ```

### 4.2. Update Merchant Profile
- **Endpoint:** `PUT /merchants/profile`
- **Description:** Updates the merchant's business profile information
- **Headers:**
    - `x-api-key: your-merchant-api-key`
- **Parameters:**
    - **Body (JSON):**
        ```json
        {
            "business_name": "Updated Business Name",
            "business_email": "new@business.com",
            "business_description": "Updated description",
            "business_address": "456 New St",
            "business_phone": "+1234567890"
        }
        ```
- **Successful Response (200 OK):**
    ```json
    {
        "business_name": "Updated Business Name",
        "business_email": "new@business.com",
        "business_description": "Updated description",
        "business_address": "456 New St",
        "business_phone": "+1234567890"
    }
    ```
- **Error Responses:**
    - **400 Bad Request:**
        ```json
        {
            "error": "Invalid phone number format"
        }
        ```
    - **401 Unauthorized:**
        ```json
        {
            "error": "API key is required"
        }
        ```

### 4.3. Upload Business Logo
- **Endpoint:** `POST /merchants/logo`
- **Description:** Uploads or updates the merchant's business logo
- **Headers:**
    - `x-api-key: your-merchant-api-key`
- **Parameters:**
    - **Form Data:**
        - `logo`: File (image/jpeg, image/png, image/gif)
- **Successful Response (200 OK):**
    ```json
    {
        "message": "Logo uploaded successfully",
        "business_logo_url": "/merchant-logos/business-logo.jpg"
    }
    ```
- **Error Responses:**
    - **400 Bad Request (Invalid File Type):**
        ```json
        {
            "error": "Invalid file type. Allowed types: jpg, jpeg, png, gif"
        }
        ```
    - **400 Bad Request (File Too Large):**
        ```json
        {
            "error": "File size cannot exceed 5MB"
        }
        ```
    - **401 Unauthorized:**
        ```json
        {
            "error": "API key is required"
        }
        ```

### 4.4. Delete Business Logo
- **Endpoint:** `DELETE /merchants/logo`
- **Description:** Removes the merchant's business logo
- **Headers:**
    - `x-api-key: your-merchant-api-key`
- **Successful Response (200 OK):**
    ```json
    {
        "message": "Logo deleted successfully",
        "business_logo_url": ""
    }
    ```
- **Error Responses:**
    - **401 Unauthorized:**
        ```json
        {
            "error": "API key is required"
        }
        ```
    - **404 Not Found:**
        ```json
        {
            "error": "No logo found for this merchant"
        }
        ```

### Notes:
- All endpoints require merchant authentication via `x-api-key` header.
- API key must be active and valid.
- Logo file size limit: 3MB.
- Supported image formats: JPG, JPEG, PNG, GIF.
- Phone numbers must be in international format (e.g., `+1234567890`).
- Logo URLs are relative to the server's base URL.

## 5. Transaction Reports Endpoints

### 5.1. Generate Transaction Report

- **Endpoint**: `GET /reports/transactions`
- **Description**: Generates a filtered report of transactions with various export options
- **Headers**:
  - **Authorization**: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Parameters**:
  - **Query Parameters**:
    - `startDate`: (Optional) Start date for the report in ISO format (e.g., "2023-01-01T00:00:00Z")
    - `endDate`: (Optional) End date for the report in ISO format (e.g., "2023-12-31T23:59:59Z")
    - `status`: (Optional) Filter by transaction status ("SUCCESS", "PENDING", "FAILED")
    - `paymentMethod`: (Optional) Filter by payment method ("card", "bank_transfer", "wallet")
    - `format`: (Optional) Response format ("json" or "csv"), defaults to "json"
- **Successful Response** (200 OK) - JSON format:
  ```json
  {
    "success": true,
    "data": {
      "summary": {
        "totalTransactions": 123,
        "totalAmount": 12345.67,
        "successfulTransactions": 115,
        "failedTransactions": 8,
        "averageTransactionAmount": 100.37
      },
      "transactions": [
        {
          "id": "tx_123abc",
          "amount": 50.0,
          "status": "SUCCESS",
          "paymentMethod": "card",
          "createdAt": "2023-05-12T09:32:41.021Z",
          "reference": "INV-001",
          "description": "Monthly subscription"
        }
        // ... more transactions ...
      ]
    }
  }
  ```
- **Successful Response** (200 OK) - CSV format:
  Text file with CSV-formatted data (Content-Type: text/csv)
- **Error Response** (401 Unauthorized):
  ```json
  {
    "success": false,
    "message": "Unauthorized"
  }
  ```
- **Error Response** (400 Bad Request):
  ```json
  {
    "success": false,
    "message": "Invalid date format"
  }
  ```
