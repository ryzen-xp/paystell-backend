import StellarSdk from "@stellar/stellar-sdk";
const {
  Server,
  TransactionBuilder,
  Operation,
  Networks,
  Memo,
  xdr,
  StrKey,
  TimeoutInfinite,
  Contract,
} = StellarSdk;
import { Redis, RedisOptions } from "ioredis";
import {
  MerchantRegistrationDTO,
  TokenSupportDTO,
  PaymentProcessingDTO,
} from "../dtos/StellarContractDTO";
import { AppError } from "../utils/AppError";
import { validateSignature } from "../utils/validateSignature";
import logger from "../utils/logger";

export class StellarContractService {
  private server: typeof Server;
  private contract: typeof Contract;
  private contractId: string;
  private redis: Redis;

  constructor() {
    this.server = new Server(
      process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
    );
    this.contractId = process.env.STELLAR_CONTRACT_ID || "";
    this.contract = new Contract(this.contractId);

    // Initialize Redis with proper configuration
    const redisOptions: RedisOptions = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD,
      username: process.env.REDIS_USERNAME,
      retryStrategy: (times: number) => {
        return Math.min(times * 50, 2000);
      },
    };

    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL);
    } else {
      this.redis = new Redis(redisOptions);
    }
  }

  /**
   * Initialize the contract client
   */
  private async initializeContract() {
    try {
      // Verify contract exists and is deployed
      const account = await this.server.loadAccount(this.contractId);
      if (!account) {
        throw new AppError("Contract not found", 404);
      }
      return account;
    } catch (error) {
      logger.error("Contract initialization failed:", error);
      throw new AppError("Failed to initialize contract", 500);
    }
  }

  /**
   * Register a new merchant
   */
  async registerMerchant(data: MerchantRegistrationDTO): Promise<boolean> {
    try {
      const account = await this.initializeContract();

      const transaction = new TransactionBuilder(account, {
        fee: await this.server.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          this.contract.call(
            "register_merchant",
            xdr.ScVal.scvString(data.merchantAddress),
          ),
        )
        .setTimeout(TimeoutInfinite)
        .build();

      // Submit the transaction
      const response = await this.server.submitTransaction(transaction);

      if (response.successful) {
        // Cache merchant data in Redis
        await this.redis.hset(`merchant:${data.merchantAddress}`, {
          name: data.name,
          email: data.email,
          registeredAt: new Date().toISOString(),
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Merchant registration failed:", error);
      const err = error as {
        response?: {
          data?: { extras?: { result_codes?: { operations?: string[] } } };
        };
      };
      if (
        err.response?.data?.extras?.result_codes?.operations?.[0] ===
        "op_already_exists"
      ) {
        throw new AppError("Merchant already registered", 409);
      }
      throw new AppError("Failed to register merchant", 500);
    }
  }

  /**
   * Add supported token for a merchant
   */
  async addSupportedToken(data: TokenSupportDTO): Promise<boolean> {
    try {
      const account = await this.initializeContract();

      const transaction = new TransactionBuilder(account, {
        fee: await this.server.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          this.contract.call(
            "add_supported_token",
            xdr.ScVal.scvString(data.merchantAddress),
            xdr.ScVal.scvString(data.tokenAddress),
          ),
        )
        .setTimeout(TimeoutInfinite)
        .build();

      const response = await this.server.submitTransaction(transaction);

      if (response.successful) {
        // Update merchant's supported tokens in cache
        await this.redis.sadd(
          `merchant:${data.merchantAddress}:tokens`,
          data.tokenAddress,
        );
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Adding supported token failed:", error);
      throw new AppError("Failed to add supported token", 500);
    }
  }

  /**
   * Process a payment with signature verification
   */
  async processPayment(data: PaymentProcessingDTO): Promise<string> {
    try {
      const account = await this.initializeContract();

      // Verify signature
      const isValidSignature = await validateSignature(
        data.paymentOrder,
        data.signature,
        data.merchantPublicKey,
      );

      if (!isValidSignature) {
        throw new AppError("Invalid signature", 400);
      }

      // Check if nonce was already used
      const nonceKey = `nonce:${data.paymentOrder.merchantAddress}:${data.paymentOrder.nonce}`;
      const nonceExists = await this.redis.exists(nonceKey);
      if (nonceExists) {
        throw new AppError("Nonce already used", 400);
      }

      // Check token support
      const isTokenSupported = await this.redis.sismember(
        `merchant:${data.paymentOrder.merchantAddress}:tokens`,
        data.paymentOrder.tokenAddress,
      );
      if (!isTokenSupported) {
        throw new AppError("Token not supported by merchant", 400);
      }

      // Build and submit transaction
      const txBuilder = new TransactionBuilder(account, {
        fee: await this.server.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          this.contract.call(
            "process_payment_with_signature",
            xdr.ScVal.scvString(data.payerAddress),
            xdr.ScVal.scvString(JSON.stringify(data.paymentOrder)),
            xdr.ScVal.scvString(data.signature),
            xdr.ScVal.scvString(data.merchantPublicKey),
          ),
        )
        .setTimeout(TimeoutInfinite);

      if (data.memo) {
        txBuilder.addMemo(Memo.text(data.memo));
      }

      const transaction = txBuilder.build();
      const response = await this.server.submitTransaction(transaction);

      if (response.successful) {
        // Store used nonce with expiration
        await this.redis.set(nonceKey, "1", "EX", 86400); // 24 hours expiration
        return response.hash;
      }

      throw new AppError("Payment processing failed", 500);
    } catch (error) {
      logger.error("Payment processing failed:", error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("Failed to process payment", 500);
    }
  }

  /**
   * Get merchant details including supported tokens
   */
  async getMerchantDetails(merchantAddress: string): Promise<any> {
    try {
      const merchantData = await this.redis.hgetall(
        `merchant:${merchantAddress}`,
      );
      if (!merchantData || Object.keys(merchantData).length === 0) {
        throw new AppError("Merchant not found", 404);
      }

      const supportedTokens = await this.redis.smembers(
        `merchant:${merchantAddress}:tokens`,
      );

      return {
        ...merchantData,
        supportedTokens,
      };
    } catch (error) {
      logger.error("Failed to get merchant details:", error);
      throw new AppError("Failed to get merchant details", 500);
    }
  }
}
