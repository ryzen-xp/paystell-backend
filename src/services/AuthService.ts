// File: src/services/AuthService.ts
import { Repository } from "typeorm";
import { User } from "../entities/User";
import { compare } from "bcryptjs";
import { sign, verify } from "jsonwebtoken";
import AppDataSource from "../config/db";
import { randomBytes, createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { redisClient } from "../config/redisConfig";

interface UserRegistrationData {
  name: string; // user name
  email: string; // user email
  password: string; // user password
}

interface UserResponse {
  id: number; // user id
  name: string; // user name
  email: string; // user email
  role: string; // user role
  isEmailVerified: boolean; // email verification status
  isWalletVerified: boolean; // wallet verification status
  createdAt: Date; // creation date
  updatedAt: Date; // last update date
  twoFactorAuth?: {
    isEnabled: boolean; // whether 2FA is enabled
  };
}

interface TokenResponse {
  accessToken: string; // access token
  refreshToken: string; // refresh token
  expiresIn: number; // expiry time in seconds
}

interface LoginResponse {
  user: UserResponse; // user info
  tokens: TokenResponse; // access and refresh tokens
}

interface JWTPayload {
  id: number; // user id
  email: string; // user email
  jti?: string; // JWT token id to identify token
  iat?: number; // issued at timestamp
  exp?: number; // expiration timestamp
}

export class AuthService {
  private userRepository: Repository<User>;
  private readonly JWT_SECRET: string;
  private readonly JWT_REFRESH_SECRET: string;
  private readonly ACCESS_TOKEN_EXPIRY: string = "15m"; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY: string = "7d"; // 7 days

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
    this.JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"; // JWT secret key
    this.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key"; // refresh token secret
  }

  private generateTokenId(): string {
    return uuidv4(); // generate unique token id
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex"); // hash token with SHA-256
  }

  private generateTokens(userId: number, email: string): TokenResponse {
    const jti = this.generateTokenId();

    const expiresIn = 15 * 60; // 15 minutes in seconds

    const accessTokenOptions: any = {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    };

    const refreshTokenOptions: any = {
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
    };

    const accessToken = sign(
      { id: userId, email, jti },
      this.JWT_SECRET,
      accessTokenOptions,
    );

    const refreshToken = sign(
      { id: userId, email, jti },
      this.JWT_REFRESH_SECRET,
      refreshTokenOptions,
    );

    return { accessToken, refreshToken, expiresIn };
  }

  private async storeRefreshToken(
    userId: number,
    jti: string,
    refreshToken: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    // Store hashed refresh token in Redis with 7 days expiry
    await redisClient.set(
      `refresh_token:${userId}:${jti}`,
      tokenHash,
      { EX: 7 * 24 * 60 * 60 },
    );
  }

  private async blacklistToken(jti: string, expiresIn: number): Promise<void> {
    // Add token to blacklist in Redis until it expires
    await redisClient.set(`blacklist:${jti}`, "revoked", { EX: expiresIn });
  }

  private async isTokenBlacklisted(jti: string): Promise<boolean> {
    const result = await redisClient.get(`blacklist:${jti}`);
    return result === "revoked"; // check if token is blacklisted
  }

  async register(userData: UserRegistrationData): Promise<UserResponse> {
    try {
      console.log("Starting user registration");

      const userExists = await this.userRepository.findOne({
        where: { email: userData.email },
      });

      if (userExists) {
        console.log("User already exists with this email:", userData.email);
        throw new Error("User with this email already exists");
      }

      console.log("Creating new user");
      const user = this.userRepository.create(userData);

      console.log("Saving user to database");
      const savedUser = await this.userRepository.save(user);

      console.log("User successfully registered:", savedUser.id);

      return {
        id: savedUser.id,
        email: savedUser.email,
        name: savedUser.name,
        role: savedUser.role,
        isEmailVerified: savedUser.isEmailVerified,
        isWalletVerified: savedUser.isWalletVerified,
        createdAt: savedUser.createdAt,
        updatedAt: savedUser.updatedAt,
      };
    } catch (error) {
      console.error("Error during registration:", error);
      throw error;
    }
  }

  async findOrCreateAuth0User(auth0Profile: any): Promise<User> {
    // First try to find user by email
    let user = await this.userRepository.findOne({
      where: { email: auth0Profile.email },
    });

    if (!user) {
      // Create new user
      user = this.userRepository.create({
        email: auth0Profile.email,
        name:
          auth0Profile.name ||
          `${auth0Profile.given_name || ""} ${auth0Profile.family_name || ""}`.trim() ||
          auth0Profile.nickname ||
          auth0Profile.email.split("@")[0], // use name and surname if exist
        password: randomBytes(32).toString("hex"), // generate random password (Auth0 handles auth)
        isEmailVerified: true, // Auth0 verifies emails
      });

      await this.userRepository.save(user);
    }

    return user;
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: ["twoFactorAuth"],
    });

    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isValidPassword = await compare(password, user.password);
    if (!isValidPassword) {
      throw new Error("Invalid credentials");
    }

    const tokens = this.generateTokens(user.id, user.email);

    // Store refresh token
    const decoded = verify(
      tokens.refreshToken,
      this.JWT_REFRESH_SECRET,
    ) as JWTPayload;
    await this.storeRefreshToken(user.id, decoded.jti!, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        isWalletVerified: user.isWalletVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        twoFactorAuth: user.twoFactorAuth
          ? { isEnabled: user.twoFactorAuth.isEnabled }
          : undefined,
      },
      tokens,
    };
  }

  async loginWithAuth0(auth0Profile: any): Promise<LoginResponse> {
    const user = await this.findOrCreateAuth0User(auth0Profile);

    const tokens = this.generateTokens(user.id, user.email);

    // Store refresh token
    const decoded = verify(
      tokens.refreshToken,
      this.JWT_REFRESH_SECRET,
    ) as JWTPayload;
    await this.storeRefreshToken(user.id, decoded.jti!, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        isWalletVerified: user.isWalletVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        twoFactorAuth: user.twoFactorAuth
          ? { isEnabled: user.twoFactorAuth.isEnabled }
          : undefined,
      },
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    try {
      // Verify refresh token
      const decoded = verify(
        refreshToken,
        this.JWT_REFRESH_SECRET,
      ) as JWTPayload;

      if (!decoded.jti) {
        throw new Error("Invalid token format");
      }

      // Check if token is blacklisted
      if (await this.isTokenBlacklisted(decoded.jti)) {
        throw new Error("Token has been revoked");
      }

      // Find user
      const user = await this.userRepository.findOne({
        where: { id: decoded.id },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Verify token exists in Redis (was issued by us)
      const tokenHash = this.hashToken(refreshToken);
      const storedHash = await redisClient.get(
        `refresh_token:${decoded.id}:${decoded.jti}`,
      );

      if (!storedHash || storedHash !== tokenHash) {
        throw new Error("Invalid refresh token");
      }

      // Delete old token (single use)
      await redisClient.del(`refresh_token:${decoded.id}:${decoded.jti}`);

      // Mark token as revoked
      if (decoded.exp && decoded.iat) {
        const expiresIn = decoded.exp - decoded.iat;
        await this.blacklistToken(decoded.jti, expiresIn);
      }

      // Generate new tokens
      const newTokens = this.generateTokens(user.id, user.email);

      // Store new refresh token
      const newDecoded = verify(
        newTokens.refreshToken,
        this.JWT_REFRESH_SECRET,
      ) as JWTPayload;

      await this.storeRefreshToken(user.id, newDecoded.jti!, newTokens.refreshToken);

      return newTokens;
    } catch (error) {
      throw new Error("Error refreshing token: " + (error as Error).message);
    }
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const decoded = verify(
        refreshToken,
        this.JWT_REFRESH_SECRET,
      ) as JWTPayload;

      if (!decoded.jti) {
        throw new Error("Invalid token format");
      }

      // Delete refresh token from Redis
      await redisClient.del(`refresh_token:${decoded.id}:${decoded.jti}`);

      // Add token to blacklist so it can't be used anymore
      if (decoded.exp && decoded.iat) {
        const expiresIn = decoded.exp - decoded.iat;
        await this.blacklistToken(decoded.jti, expiresIn);
      }
    } catch (error) {
      throw new Error("Error logging out: " + (error as Error).message);
    }
  }
}
