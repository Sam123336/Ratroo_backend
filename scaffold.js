const fs = require('fs');
const path = require('path');

const modules = [
  { name: 'Places', path: 'places', route: 'v1/places' },
  { name: 'Connectivity', path: 'connectivity', route: 'v1/connectivity' },
  { name: 'Ferry', path: 'ferry', route: 'v1/ferry' },
  { name: 'Railway', path: 'rail', route: 'v1/rail' },
  { name: 'Metro', path: 'metro', route: 'v1/metro' },
  { name: 'Tram', path: 'tram', route: 'v1/tram' },
  { name: 'Favorites', path: 'favorites', route: 'v1/favorites' },
  { name: 'Analytics', path: 'analytics', route: 'v1/analytics' }
];

const getControllerTemplate = (name, route, pathName) => `import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ${name}Service } from '../services/${pathName}.service';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('${route}')
export class ${name}Controller {
  constructor(private readonly service: ${name}Service) {}

  @Get()
  async getBaseEndpoint(): Promise<ApiResult<any>> {
    return this.service.getMockData();
  }
}
`;

const getServiceTemplate = (name) => `import { Injectable, NotImplementedException } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';

@Injectable()
export class ${name}Service {
  async getMockData(): Promise<ApiResult<any>> {
    throw new NotImplementedException('${name} APIs are under development.');
  }
}
`;

const getModuleTemplate = (name, pathName) => `import { Module } from '@nestjs/common';
import { ${name}Controller } from './controllers/${pathName}.controller';
import { ${name}Service } from './services/${pathName}.service';

@Module({
  controllers: [${name}Controller],
  providers: [${name}Service],
  exports: [${name}Service],
})
export class ${name}Module {}
`;

modules.forEach(mod => {
  const dirPath = path.join(__dirname, 'apps', 'api', 'src', 'modules', mod.path);
  
  fs.writeFileSync(
    path.join(dirPath, 'controllers', mod.path + '.controller.ts'),
    getControllerTemplate(mod.name, mod.route, mod.path)
  );
  
  fs.writeFileSync(
    path.join(dirPath, 'services', mod.path + '.service.ts'),
    getServiceTemplate(mod.name)
  );
  
  fs.writeFileSync(
    path.join(dirPath, mod.path + '.module.ts'),
    getModuleTemplate(mod.name, mod.path)
  );
  
  console.log('Created ' + mod.name + ' Module');
});
