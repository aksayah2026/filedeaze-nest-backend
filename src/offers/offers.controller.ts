import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OffersService } from './offers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';
import { CreateOfferDto, UpdateOfferDto } from './dto/offer.dto';

// ── Web routes: ADMIN / MANAGER manage offers ─────────────────────────────────

@ApiTags('Offers (Web)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@Controller('web/offers')
export class WebOffersController {
  constructor(private readonly service: OffersService) {}

  @Get()
  @ApiOperation({ summary: 'List all offers for this tenant' })
  findAll(@TenantId() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new offer' })
  create(@TenantId() tenantId: string, @Body() dto: CreateOfferDto) {
    return this.service.create(tenantId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get offer details' })
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an offer' })
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate an offer' })
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}

// ── Mobile routes: customers browse active offers ─────────────────────────────

@ApiTags('Offers (Mobile)')
@Controller('mobile/offers')
export class MobileOffersController {
  constructor(private readonly service: OffersService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List active offers (date-filtered, no auth required)' })
  getActiveOffers(@TenantId() tenantId: string) {
    return this.service.findActiveForMobile(tenantId);
  }
}
