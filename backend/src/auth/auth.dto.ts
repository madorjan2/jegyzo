import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'uj@jegyzo.local' })
  @IsEmail({}, { message: 'VALIDATION_ERROR' })
  email!: string;

  @ApiProperty({ example: 'Vasarlo1234', minLength: 8 })
  @IsString()
  @Length(8)
  @Matches(/[a-z]/, { message: 'lowercase required' })
  @Matches(/[A-Z]/, { message: 'uppercase required' })
  @Matches(/[0-9]/, { message: 'digit required' })
  password!: string;

  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  fullName!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'uj@jegyzo.local' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: '+36301234567' })
  @IsOptional()
  @Matches(/^\+36[0-9]{9}$/, { message: 'phone must be +36 followed by 9 digits' })
  phone?: string;

  @ApiPropertyOptional({ enum: ['hu', 'en'] })
  @IsOptional()
  @IsIn(['hu', 'en'])
  locale?: 'hu' | 'en';
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @Length(8)
  @Matches(/[a-z]/, { message: 'lowercase required' })
  @Matches(/[A-Z]/, { message: 'uppercase required' })
  @Matches(/[0-9]/, { message: 'digit required' })
  newPassword!: string;
}
