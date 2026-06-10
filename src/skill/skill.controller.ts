import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SkillService } from './skill.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/current-user.decorator';
import { ParseUUIDPipe } from '../common/pipes/parse-uuid.pipe';
import { UserRole } from '@prisma/client';
import { CreateSkillDto, UpdateSkillDto, AssignSkillDto, UpdateTechnicianSkillDto } from './dto/skill.dto';

@ApiTags('Skills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@Controller('web/manager')
export class SkillController {
  constructor(private readonly service: SkillService) {}

  // ── Screen 1 — Skill List ─────────────────────────────────────────────────

  @Get('skills')
  @ApiOperation({ summary: 'List skills with optional search and status filter' })
  @ApiQuery({ name: 'search',   required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  listSkills(
    @TenantId() tenantId: string,
    @Query('search')   search?: string,
    @Query('isActive') isActive?: string,
  ) {
    const active = isActive === undefined ? undefined : isActive === 'true';
    return this.service.listSkills(tenantId, search, active);
  }

  // ── Screen 6 — Skill-Based Recommendation (defined before /:id) ──────────

  @Get('skills/recommend')
  @ApiOperation({ summary: 'Get recommended technicians by skill match' })
  @ApiQuery({ name: 'skillId', required: true })
  getRecommendedTechnicians(
    @TenantId() tenantId: string,
    @Query('skillId') skillId: string,
  ) {
    return this.service.getRecommendedTechnicians(tenantId, skillId);
  }

  // ── Screen 2 — Create Skill ───────────────────────────────────────────────

  @Post('skills')
  @ApiOperation({ summary: 'Create a new skill' })
  createSkill(@TenantId() tenantId: string, @Body() dto: CreateSkillDto) {
    return this.service.createSkill(tenantId, dto);
  }

  // ── Screen 3 — Edit Skill ─────────────────────────────────────────────────

  @Patch('skills/:id')
  @ApiOperation({ summary: 'Update skill name, description, or active status' })
  updateSkill(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSkillDto,
  ) {
    return this.service.updateSkill(tenantId, id, dto);
  }

  // ── Screen 5 — Assigned Skills View ──────────────────────────────────────

  @Get('technicians/:techId/skills')
  @ApiOperation({ summary: 'View all skills assigned to a technician' })
  getTechnicianSkills(
    @TenantId() tenantId: string,
    @Param('techId', ParseUUIDPipe) techId: string,
  ) {
    return this.service.getTechnicianSkills(tenantId, techId);
  }

  // ── Screen 4 — Technician Skill Assignment ────────────────────────────────

  @Post('technicians/:techId/skills')
  @ApiOperation({ summary: 'Assign a skill to a technician' })
  assignSkill(
    @TenantId() tenantId: string,
    @Param('techId', ParseUUIDPipe) techId: string,
    @Body() dto: AssignSkillDto,
  ) {
    return this.service.assignSkill(tenantId, techId, dto);
  }

  @Patch('technicians/:techId/skills/:skillId')
  @ApiOperation({ summary: 'Update experience level or certification details' })
  updateTechnicianSkill(
    @TenantId() tenantId: string,
    @Param('techId',  ParseUUIDPipe) techId: string,
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: UpdateTechnicianSkillDto,
  ) {
    return this.service.updateTechnicianSkill(tenantId, techId, skillId, dto);
  }

  @Delete('technicians/:techId/skills/:skillId')
  @ApiOperation({ summary: 'Remove a skill from a technician' })
  removeSkill(
    @TenantId() tenantId: string,
    @Param('techId',  ParseUUIDPipe) techId: string,
    @Param('skillId', ParseUUIDPipe) skillId: string,
  ) {
    return this.service.removeSkill(tenantId, techId, skillId);
  }
}
