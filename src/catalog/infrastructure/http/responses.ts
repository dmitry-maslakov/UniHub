import { ApiProperty } from '@nestjs/swagger';

// what the admin routes answer with, described for OpenAPI

export class CourseCreatedResponse {
  @ApiProperty({
    description: "the course's id, which the routes of grants name it by",
  })
  id!: string;
}
