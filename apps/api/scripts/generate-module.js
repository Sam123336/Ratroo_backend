#!/usr/bin/env node
/**
 * Feature module generator.
 *
 *   npm run gen:module -- ferry-terminal
 *   npm run gen:module -- ferry-terminal --no-entity   # no table, service only
 *
 * Emits the standard feature layout (see docs/ARCHITECTURE.md) so every module
 * looks the same and a new developer can guess where anything lives:
 *
 *   src/modules/<feature>/
 *     <feature>.module.ts          wiring — the only file other modules import
 *     controllers/                 HTTP in, DTO out. No business logic.
 *     services/                    business logic. No SQL, no req/res.
 *     repositories/                data access. The only place models are touched.
 *     entities/                    Sequelize models = table shape
 *     dto/                         response/request contracts
 *
 * Does NOT edit app.module.ts — it prints the two lines to paste, so a generator
 * bug can never scramble the root module.
 */
const fs = require('fs');
const path = require('path');

const [, , rawName, ...flags] = process.argv;
const withEntity = !flags.includes('--no-entity');

if (!rawName || rawName.startsWith('-')) {
  console.error('Usage: npm run gen:module -- <feature-name> [--no-entity]');
  process.exit(1);
}

const kebab = rawName
  .trim()
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

if (!kebab) {
  console.error(`"${rawName}" has no usable characters.`);
  process.exit(1);
}

const pascal = kebab.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
const camel = pascal[0].toLowerCase() + pascal.slice(1);
const plural = kebab.endsWith('s') ? kebab : `${kebab}s`;
const tableName = plural.replace(/-/g, '_');

const root = path.resolve(__dirname, '..', 'src', 'modules', kebab);

if (fs.existsSync(root)) {
  console.error(`${path.relative(process.cwd(), root)} already exists — pick another name or delete it.`);
  process.exit(1);
}

const files = {
  [`${kebab}.module.ts`]: `import { Module } from '@nestjs/common';
${withEntity ? `import { SequelizeModule } from '@nestjs/sequelize';\n` : ''}import { ${pascal}Controller } from './controllers/${kebab}.controller';
import { ${pascal}Service } from './services/${kebab}.service';
${withEntity ? `import { ${pascal}Repository } from './repositories/${kebab}.repository';\nimport { ${pascal}Model } from './entities/${kebab}.model';\n` : ''}
@Module({
${withEntity ? `  imports: [SequelizeModule.forFeature([${pascal}Model])],\n` : ''}  controllers: [${pascal}Controller],
  providers: [${pascal}Service${withEntity ? `, ${pascal}Repository` : ''}],
  exports: [${pascal}Service],
})
export class ${pascal}Module {}
`,

  [`controllers/${kebab}.controller.ts`]: `import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';
import { ${pascal}Service } from '../services/${kebab}.service';
import { ${pascal}ResponseDto } from '../dto/${kebab}-response.dto';

// Controllers only translate HTTP <-> service calls. No business logic here.
@Controller('v1/${plural}')
export class ${pascal}Controller {
  constructor(private readonly ${camel}Service: ${pascal}Service) {}

  @Get()
  async findAll(@Query('limit') limit = 50): Promise<ApiResult<${pascal}ResponseDto[]>> {
    return this.${camel}Service.findAll(Number(limit));
  }

  // ParseUUIDPipe -> 400 instead of a Postgres cast error surfacing as a 500.
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ApiResult<${pascal}ResponseDto>> {
    return this.${camel}Service.findOne(id);
  }
}
`,

  [`services/${kebab}.service.ts`]: `import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';
import { ${pascal}ResponseDto } from '../dto/${kebab}-response.dto';
${withEntity ? `import { ${pascal}Repository } from '../repositories/${kebab}.repository';\n` : ''}
// Business logic lives here. No SQL, no request/response objects.
@Injectable()
export class ${pascal}Service {
${withEntity ? `  constructor(private readonly ${camel}Repository: ${pascal}Repository) {}\n` : ''}
  async findAll(limit: number): Promise<ApiResult<${pascal}ResponseDto[]>> {
${withEntity
    ? `    const rows = await this.${camel}Repository.findAll(limit);
    return new ApiResult(rows.map(row => ${pascal}ResponseDto.fromModel(row)));`
    : `    void limit;
    return new ApiResult([]);`}
  }

  async findOne(id: string): Promise<ApiResult<${pascal}ResponseDto>> {
${withEntity
    ? `    const row = await this.${camel}Repository.findById(id);

    if (!row) {
      throw new NotFoundException(\`${pascal} \${id} was not found.\`);
    }

    return new ApiResult(${pascal}ResponseDto.fromModel(row));`
    : `    throw new NotFoundException(\`${pascal} \${id} was not found.\`);`}
  }
}
`,

  [`dto/${kebab}-response.dto.ts`]: `${withEntity ? `import { ${pascal}Model } from '../entities/${kebab}.model';\n\n` : ''}// The API contract. Change this deliberately — clients depend on these names.
export class ${pascal}ResponseDto {
  id: string;
  name: string;
${withEntity
    ? `
  static fromModel(model: ${pascal}Model): ${pascal}ResponseDto {
    return { id: model.id, name: model.name };
  }`
    : ''}
}
`,
};

if (withEntity) {
  files[`entities/${kebab}.model.ts`] = `import { Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';

// Table shape only. Create the table with a migration:
//   npm run migrate:create -- create-${tableName}
@Table({ tableName: '${tableName}', timestamps: true })
export class ${pascal}Model extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare name: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
`;

  files[`repositories/${kebab}.repository.ts`] = `import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ${pascal}Model } from '../entities/${kebab}.model';

// The only place ${pascal}Model is queried. Swap the datastore here, nowhere else.
@Injectable()
export class ${pascal}Repository {
  constructor(@InjectModel(${pascal}Model) private readonly model: typeof ${pascal}Model) {}

  findAll(limit: number) {
    return this.model.findAll({ limit, order: [['name', 'ASC']] });
  }

  findById(id: string) {
    return this.model.findByPk(id);
  }
}
`;
}

for (const [relativePath, contents] of Object.entries(files)) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  console.log(`  created  src/modules/${kebab}/${relativePath}`);
}

console.log(`\nAdd to apps/api/src/app.module.ts:\n`);
console.log(`  import { ${pascal}Module } from './modules/${kebab}/${kebab}.module';`);
console.log(`  // ...then add ${pascal}Module to the imports array\n`);

if (withEntity) {
  console.log(`Then create the table:\n`);
  console.log(`  npm run migrate:create -- create-${tableName}\n`);
  console.log(`and register ${pascal}Model wherever the module's models are collected.\n`);
}
