import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Charger } from './charger.entity';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class ChargerService {
  constructor(
    @InjectRepository(Charger)
    private readonly chargerRepository: Repository<Charger>,
  ) {}

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
  async registerOrUpdate(
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
    const updateColumns = ['charge_point_model', 'charge_point_vendor'];
    const optionalMetadata = {
      firmware_version: input.firmwareVersion,
      charge_point_serial_number: input.chargePointSerialNumber,
      charge_box_serial_number: input.chargeBoxSerialNumber,
      iccid: input.iccid,
      imsi: input.imsi,
      meter_type: input.meterType,
      meter_serial_number: input.meterSerialNumber,
    };
    for (const [column, value] of Object.entries(optionalMetadata)) {
      if (value !== undefined) updateColumns.push(column);
    }

    await this.chargerRepository
      .createQueryBuilder()
      .insert()
      .into(Charger)
      .values({
        id: randomUUID(),
        connectionId,
        chargePointModel: input.chargePointModel,
        chargePointVendor: input.chargePointVendor,
        firmwareVersion: input.firmwareVersion,
        chargePointSerialNumber: input.chargePointSerialNumber,
        chargeBoxSerialNumber: input.chargeBoxSerialNumber,
        iccid: input.iccid,
        imsi: input.imsi,
        meterType: input.meterType,
        meterSerialNumber: input.meterSerialNumber,
      })
      .orUpdate(updateColumns, ['connection_id'])
      .execute();
  }
}
