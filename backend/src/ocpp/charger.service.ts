import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Charger } from './charger.entity';
import * as argon2 from 'argon2';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';

@Injectable()
export class ChargerService {
  constructor(
    @InjectRepository(Charger)
    private readonly chargerRepository: Repository<Charger>,
  ) { }

  async findByConnectionId(connectionId: string): Promise<Charger | null> {
    return await this.chargerRepository.findOneBy({ connectionId });
  }

  async save(
    connectionId: string,
    input: {
      chargePointModel: string;
      chargePointVendor: string;
      chargePointSerialNumber?: string;
      chargeBoxSerialNumber?: string;
      firmwareVersion?: string;
      iccid?: string;
      imsi?: string;
      meterType?: string;
      meterSerialNumber?: string;
    },
  ) {
    const createdCharger = this.chargerRepository.create({
      id: randomUUID(),
      connectionId: connectionId,
      chargePointModel: input.chargePointModel,
      chargePointVendor: input.chargePointVendor,
      chargePointSerialNumber: input.chargePointSerialNumber,
      chargeBoxSerialNumber: input.chargeBoxSerialNumber,
      firmwareVersion: input.firmwareVersion,
      iccid: input.iccid,
      imsi: input.imsi,
      meterType: input.meterType,
      meterSerialNumber: input.meterSerialNumber,
    });

    return await this.chargerRepository.save(createdCharger);
  }
  async update(
    connectionId: string,
    input: {
      chargePointModel?: string;
      chargePointVendor?: string;
      chargePointSerialNumber?: string;
      chargeBoxSerialNumber?: string;
      firmwareVersion?: string;
      iccid?: string;
      imsi?: string;
      meterType?: string;
      meterSerialNumber?: string;
    },
  ) {
    const result = await this.chargerRepository.update(
      { connectionId },
      {
        chargePointModel: input.chargePointModel,
        chargePointVendor: input.chargePointVendor,
        firmwareVersion: input.firmwareVersion,
        chargePointSerialNumber: input.chargePointSerialNumber,
        chargeBoxSerialNumber: input.chargeBoxSerialNumber,
        iccid: input.iccid,
        imsi: input.imsi,
        meterType: input.meterType,
        meterSerialNumber: input.meterSerialNumber,
      },
    );

    if (result.affected !== 1) {
      throw new Error('No provisioned charger matched BootNotification');
    }
  }

  async verifyCredentials(input: {
    connectionId: string;
    password: Buffer<ArrayBufferLike>;
  }): Promise<boolean> {
    const foundCharger = await this.chargerRepository.findOne({
      where: { connectionId: input.connectionId },
      select: {
        passwordHash: true,
      },
    });
    if (!foundCharger) {
      return false;
    }
    if (!(await argon2.verify(foundCharger.passwordHash, input.password))) {
      return false;
    }
    return true;
  }

  async provision(input: {
    connectionId: string;
    password: string;
  }): Promise<{ id: string; connectionId: string }> {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const newCharger = this.chargerRepository.create({
      id: randomUUID(),
      connectionId: input.connectionId,
      passwordHash,
    });

    const savedCharger = await this.chargerRepository.save(newCharger);
    return {
      id: savedCharger.id,
      connectionId: savedCharger.connectionId,
    };
  }
}
