import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ChargeStateService } from '../ocpp/charger-state.service';
import { OcppServerService } from '../ocpp/ocpp-server.service';
import type { ChargePointState } from '../ocpp/ocpp.types';
import express from 'express';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../users/user.service';

@Controller('chargers')
export class ChargerController {
  constructor(
    private readonly chargeStateService: ChargeStateService,
    private readonly ocppServerService: OcppServerService,
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Get()
  list() {
    return this.chargeStateService
      .getAll()
      .map((charger) => this.serialize(charger));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    const charger = this.chargeStateService.get(id);
    if (!charger) {
      throw new NotFoundException(`Unknown charger: ${id}`);
    }
    return this.serialize(charger);
  }

  @Post(':id/start')
  @HttpCode(200)
  async start(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: express.Request,
  ) {
    // Check if user is logged-in, session still hasn't expired.
    const currentUserId = request.session.userId;
    if (!currentUserId) {
      throw new UnauthorizedException();
    }
    // We check database if the user still exists before proceeding
    const authenticatedUser =
      await this.authService.getCurrentUser(currentUserId);

    const payload = this.requireBody(body);

    if (
      payload.connectorId !== undefined &&
      (typeof payload.connectorId !== 'number' ||
        !Number.isSafeInteger(payload.connectorId) ||
        payload.connectorId < 1)
    ) {
      throw new BadRequestException('connectorId must be a positive integer');
    }
    this.get(id);

    const identity = await this.userService.findChargingIdentity(
      authenticatedUser.id,
    );

    if (!identity) {
      throw new UnauthorizedException();
    }
    return this.ocppServerService.remoteStartTransaction(id, {
      idTag: identity.idTag,
      ...(payload.connectorId !== undefined
        ? { connectorId: payload.connectorId }
        : {}),
    });
  }

  @Post(':id/connector/:connector/stop')
  @HttpCode(200)
  async stop(
    @Param('id') id: string,
    @Param('connector', ParseIntPipe) connector: number,
    @Req() request: express.Request,
  ) {
    // Check if user is logged-in, session still hasn't expired.
    const currentUserId = request.session.userId;
    if (!currentUserId) {
      throw new UnauthorizedException();
    }
    // We check database if the user still exists before proceeding
    const user = await this.authService.getCurrentUser(currentUserId);

    const session = await this.ocppServerService.getActiveSession(
      id,
      connector,
    );

    if (!session) {
      throw new NotFoundException(`No active transactions on ${id}`);
    }

    return this.ocppServerService.remoteStopTransaction(id, {
      transactionId: session.transactionId,
    });
  }

  private requireBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('A JSON object body is required');
    }
    return body as Record<string, unknown>;
  }

  private serialize(charger: ChargePointState) {
    return { ...charger, connectors: Array.from(charger.connectors.values()) };
  }
}
