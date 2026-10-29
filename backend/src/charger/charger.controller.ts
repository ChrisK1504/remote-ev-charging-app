import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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

  // TODO: A user gets a list of only his owned vehicles.
  @Get()
  list() {
    return this.chargeStateService
      .getAll()
      .map((charger) => this.serialize(charger));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    const charger = this.chargeStateService.get(id); // Persist chargeStateService eventually
    if (!charger) {
      throw new NotFoundException(`Unknown charger: ${id}`);
    }
    return this.serialize(charger);
  }

  @Post(':id/connector/:connectorId/start')
  @HttpCode(200)
  async start(
    @Param('id') id: string,
    @Param('connectorId', ParseIntPipe) connectorId: number,
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

    if (connectorId < 1) {
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
      connectorId,
    });
  }

  @Post(':id/connector/:connectorId/stop')
  @HttpCode(200)
  async stop(
    @Param('id') chargePointId: string,
    @Param('connectorId', ParseIntPipe) connectorId: number,
    @Req() request: express.Request,
  ) {
    // Check if user is logged-in, session still hasn't expired.
    const currentUserId = request.session.userId;
    if (!currentUserId) {
      throw new UnauthorizedException();
    }
    // We check database if the user still exists before proceeding
    const user = await this.authService.getCurrentUser(currentUserId);

    if (connectorId < 1) {
      throw new BadRequestException('connectorId must be a positive integer');
    }

    const session = await this.ocppServerService.getActiveSession(
      chargePointId,
      connectorId,
    );

    if (!session) {
      throw new NotFoundException(`No active transactions on ${chargePointId}`);
    }

    if (session.userId !== user.id) {
      throw new ForbiddenException(
        'You cannot stop a charging session you do not own',
      );
    }

    return this.ocppServerService.remoteStopTransaction(chargePointId, {
      transactionId: session.transactionId,
    });
  }

  private serialize(charger: ChargePointState) {
    return { ...charger, connectors: Array.from(charger.connectors.values()) };
  }
}
