import { IsString, IsOptional, IsBoolean, IsEnum, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExperienceLevel } from '@prisma/client';

export class CreateSkillDto {
  @ApiProperty({ example: 'AC Repair' })
  @IsString({ message: 'Skill name must be a string' })
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Installation and repair of split/window AC units' })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;
}

export class UpdateSkillDto {
  @ApiPropertyOptional({ example: 'AC Repair & Installation' })
  @IsOptional()
  @IsString({ message: 'Skill name must be a string' })
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}

export class AssignSkillDto {
  @ApiProperty({ description: 'Skill ID to assign' })
  @IsString({ message: 'Skill ID must be a string' })
  skillId: string;

  @ApiPropertyOptional({ enum: ExperienceLevel, default: ExperienceLevel.BEGINNER })
  @IsOptional()
  @IsEnum(ExperienceLevel, { message: 'Experience level must be BEGINNER, INTERMEDIATE, or EXPERT' })
  experienceLevel?: ExperienceLevel;

  @ApiPropertyOptional({ example: 'CERT-2024-001' })
  @IsOptional()
  @IsString({ message: 'Certification number must be a string' })
  certificationNumber?: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString({}, { message: 'Certification expiry must be a valid date string' })
  certificationExpiryDate?: string;
}

export class UpdateTechnicianSkillDto {
  @ApiPropertyOptional({ enum: ExperienceLevel })
  @IsOptional()
  @IsEnum(ExperienceLevel, { message: 'Experience level must be BEGINNER, INTERMEDIATE, or EXPERT' })
  experienceLevel?: ExperienceLevel;

  @ApiPropertyOptional({ example: 'CERT-2024-001' })
  @IsOptional()
  @IsString({ message: 'Certification number must be a string' })
  certificationNumber?: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString({}, { message: 'Certification expiry must be a valid date string' })
  certificationExpiryDate?: string;
}
