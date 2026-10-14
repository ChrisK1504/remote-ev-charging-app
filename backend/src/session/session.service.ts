import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ChargingSession } from './charging-session.entity';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(ChargingSession)
    private readonly sessions: Repository<ChargingSession>,
  ) {}

  async start(input: {
    chargePointId: string;
    connectorId: number;
    idTag: string;
    meterStart: number;
    startedAt: Date;
  }): Promise<ChargingSession> {
    const id = randomUUID();

    const newSession = this.sessions.create({
      id,
      connectorId: input.connectorId,
      chargePointId: input.chargePointId,
      status: 'Active',
      idTag: input.idTag,
      meterStart: input.meterStart,
      startedAt: input.startedAt,
      endedAt: null,
      meterStop: null,
    });

    return this.sessions.save(newSession);
  }

  async complete(input: {
    transactionId: number;
    chargePointId: string;
    endedAt: Date;
    meterStop: number;
  }): Promise<boolean> {
    const result = await this.sessions.update(
      {
        transactionId: input.transactionId,
        chargePointId: input.chargePointId,
        status: 'Active',
      },
      {
        status: 'Completed',
        endedAt: input.endedAt,
        meterStop: input.meterStop,
      },
    );

    return result.affected === 1;
  }

  async findActive(
    chargePointId: string,
    connectorId: number,
  ): Promise<ChargingSession | null> {
    return await this.sessions.findOneBy({
      chargePointId,
      connectorId,
      status: 'Active',
    });
  }
}
