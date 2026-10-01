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
} from '@nestjs/common';
import { ChargeStateService } from '../ocpp/charger-state.service';
import { OcppServerService } from '../ocpp/ocpp-server.service';
import type { ChargePointState } from '../ocpp/ocpp.types';

@Controller('chargers')
export class ChargerController {
  constructor(
    private readonly chargeStateService: ChargeStateService,
    private readonly ocppServerService: OcppServerService,
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
  start(@Param('id') id: string, @Body() body: unknown) {
    const payload = this.requireBody(body);
    if (
      typeof payload.idTag !== 'string' ||
      payload.idTag.trim().length === 0 ||
      payload.idTag.length > 20
    ) {
      throw new BadRequestException(
        'idTag must be a non-empty string of at most 20 characters',
      );
    }
    if (
      payload.connectorId !== undefined &&
      (typeof payload.connectorId !== 'number' ||
        !Number.isSafeInteger(payload.connectorId) ||
        payload.connectorId < 1)
    ) {
      throw new BadRequestException('connectorId must be a positive integer');
    }
    this.get(id);
    return this.ocppServerService.remoteStartTransaction(id, {
      idTag: payload.idTag,
      ...(payload.connectorId !== undefined
        ? { connectorId: payload.connectorId }
        : {}),
    });
  }

  @Post(':id/connector/:connector/stop')
  @HttpCode(200)
  stop(
    @Param('id') id: string,
    @Param('connector', ParseIntPipe) connector: number,
  ) {
    const transaction = this.ocppServerService.getActiveTransaction(
      id,
      connector,
    );

    if (!transaction) {
      return new NotFoundException(`No active transactions on ${id}`);
    }

    return this.ocppServerService.remoteStopTransaction(id, {
      transactionId: transaction?.transactionId,
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
