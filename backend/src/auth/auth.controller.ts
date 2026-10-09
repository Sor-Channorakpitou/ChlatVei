import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public, ReqMeta, RequestMeta } from '../common/auth.decorators';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';
import { AuthService, IssuedTokens } from './auth.service';

export const REFRESH_COOKIE = 'chlatvei_refresh';
const COOKIE_PATH = '/api/auth';
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, ...tokens } = await this.auth.register(dto);
    this.setRefreshCookie(res, tokens);
    return { data: { accessToken: tokens.accessToken, user } };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, ...tokens } = await this.auth.login(dto);
    this.setRefreshCookie(res, tokens);
    return { data: { accessToken: tokens.accessToken, user } };
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
    this.setRefreshCookie(res, tokens);
    return { data: { accessToken: tokens.accessToken } };
  }

  /** Signed-in users only. Ends all other sessions and returns a new access token for this one. */
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.changePassword(u.id, dto, meta);
    this.setRefreshCookie(res, tokens);
    return { data: { accessToken: tokens.accessToken } };
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  private setRefreshCookie(res: Response, tokens: IssuedTokens): void {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: tokens.refreshExpiresAt,
    });
  }
}
