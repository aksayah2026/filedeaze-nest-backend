import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import { CreateSkillDto, UpdateSkillDto, AssignSkillDto, UpdateTechnicianSkillDto } from './dto/skill.dto';

@Injectable()
export class SkillService {
  private readonly logger = new Logger(SkillService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Skill CRUD (Screens 1–3) ──────────────────────────────────────────────

  async listSkills(tenantId: string, search?: string, isActive?: boolean) {
    try {
      const skills = await this.prisma.skill.findMany({
        where: {
          tenantId,
          ...(search   && { name: { contains: search, mode: 'insensitive' } }),
          ...(isActive !== undefined && { isActive }),
        },
        include: { _count: { select: { technicianSkills: true } } },
        orderBy: { name: 'asc' },
      });
      return { data: skills };
    } catch (error) {
      handlePrismaError(error, 'Skill');
    }
  }

  async createSkill(tenantId: string, dto: CreateSkillDto) {
    try {
      const existing = await this.prisma.skill.findFirst({
        where: { tenantId, name: { equals: dto.name, mode: 'insensitive' } },
      });
      if (existing) throw new ConflictException(`Skill "${dto.name}" already exists`);

      const skill = await this.prisma.skill.create({
        data: { tenantId, name: dto.name, description: dto.description },
      });
      this.logger.log(`Skill created: ${skill.name} in tenant ${tenantId}`);
      return { message: 'Skill created successfully', data: skill };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      handlePrismaError(error, 'Skill');
    }
  }

  async updateSkill(tenantId: string, skillId: string, dto: UpdateSkillDto) {
    try {
      const skill = await this.prisma.skill.findFirst({ where: { id: skillId, tenantId } });
      if (!skill) throw new NotFoundException(`Skill "${skillId}" not found`);

      if (dto.name && dto.name !== skill.name) {
        const conflict = await this.prisma.skill.findFirst({
          where: { tenantId, name: { equals: dto.name, mode: 'insensitive' }, id: { not: skillId } },
        });
        if (conflict) throw new ConflictException(`Skill "${dto.name}" already exists`);
      }

      const updated = await this.prisma.skill.update({ where: { id: skillId }, data: dto });
      return { message: 'Skill updated successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) throw error;
      handlePrismaError(error, 'Skill');
    }
  }

  // ── Technician Skill Assignment (Screens 4–5) ─────────────────────────────

  async assignSkill(tenantId: string, technicianId: string, dto: AssignSkillDto) {
    try {
      const [technician, skill] = await Promise.all([
        this.prisma.technician.findFirst({ where: { id: technicianId, tenantId } }),
        this.prisma.skill.findFirst({ where: { id: dto.skillId, tenantId, isActive: true } }),
      ]);
      if (!technician) throw new NotFoundException('Technician not found');
      if (!skill)      throw new NotFoundException('Skill not found or inactive');

      const existing = await this.prisma.technicianSkill.findUnique({
        where: { technicianId_skillId: { technicianId, skillId: dto.skillId } },
      });
      if (existing) throw new ConflictException('Technician already has this skill assigned');

      const assigned = await this.prisma.technicianSkill.create({
        data: {
          tenantId,
          technicianId,
          skillId: dto.skillId,
          experienceLevel: dto.experienceLevel ?? 'BEGINNER',
          certificationNumber: dto.certificationNumber,
          certificationExpiryDate: dto.certificationExpiryDate ? new Date(dto.certificationExpiryDate) : null,
        },
        include: { skill: true },
      });
      return { message: 'Skill assigned successfully', data: assigned };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) throw error;
      handlePrismaError(error, 'TechnicianSkill');
    }
  }

  async updateTechnicianSkill(tenantId: string, technicianId: string, skillId: string, dto: UpdateTechnicianSkillDto) {
    try {
      const record = await this.prisma.technicianSkill.findUnique({
        where: { technicianId_skillId: { technicianId, skillId } },
      });
      if (!record || record.tenantId !== tenantId) throw new NotFoundException('Skill assignment not found');

      const updated = await this.prisma.technicianSkill.update({
        where: { technicianId_skillId: { technicianId, skillId } },
        data: {
          ...dto,
          certificationExpiryDate: dto.certificationExpiryDate ? new Date(dto.certificationExpiryDate) : undefined,
        },
        include: { skill: true },
      });
      return { message: 'Skill updated successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'TechnicianSkill');
    }
  }

  async removeSkill(tenantId: string, technicianId: string, skillId: string) {
    try {
      const record = await this.prisma.technicianSkill.findUnique({
        where: { technicianId_skillId: { technicianId, skillId } },
      });
      if (!record || record.tenantId !== tenantId) throw new NotFoundException('Skill assignment not found');

      await this.prisma.technicianSkill.delete({
        where: { technicianId_skillId: { technicianId, skillId } },
      });
      return { message: 'Skill removed successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'TechnicianSkill');
    }
  }

  async getTechnicianSkills(tenantId: string, technicianId: string) {
    try {
      const technician = await this.prisma.technician.findFirst({ where: { id: technicianId, tenantId } });
      if (!technician) throw new NotFoundException('Technician not found');

      const skills = await this.prisma.technicianSkill.findMany({
        where: { technicianId, tenantId },
        include: { skill: true },
        orderBy: { experienceLevel: 'desc' },
      });
      return { data: { technician, skills } };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'TechnicianSkill');
    }
  }

  // ── Skill-Based Recommendation (Screen 6) ────────────────────────────────

  async getRecommendedTechnicians(tenantId: string, skillId: string) {
    try {
      const skill = await this.prisma.skill.findFirst({ where: { id: skillId, tenantId } });
      if (!skill) throw new NotFoundException('Skill not found');

      const assignments = await this.prisma.technicianSkill.findMany({
        where: { tenantId, skillId, technician: { isActive: true } },
        include: {
          technician: {
            select: {
              id: true, name: true, phone: true, rating: true, totalJobs: true,
              currentLat: true, currentLng: true, isActive: true,
            },
          },
        },
        orderBy: [{ experienceLevel: 'desc' }, { technician: { rating: 'desc' } }],
      });

      return {
        data: {
          skill,
          recommended: assignments.map((a) => ({
            ...a.technician,
            experienceLevel: a.experienceLevel,
            certificationNumber: a.certificationNumber,
            certificationExpiryDate: a.certificationExpiryDate,
            skillMatchIndicator: true,
          })),
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'SkillRecommendation');
    }
  }
}
