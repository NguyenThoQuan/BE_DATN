import { faker } from "@faker-js/faker/locale/vi";
import fs from "fs";

const randomCompanyList = (numberOfCompanies) => {
  if (numberOfCompanies <= 0) return [];

  const companyList = Array.from({ length: numberOfCompanies }).map(() => ({
    id: faker.string.uuid(),
    name: faker.company.name(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    thumbnaiUrl: faker.image.urlPicsumPhotos({ width: 200, height: 200 }),
  }));

  return companyList;
};

const randomPersonList = (companyList, numberOfPerson) => {
  if (numberOfPerson <= 0) return [];

  const personList = [];

  for (const company of companyList) {
    for (let i = 0; i < numberOfPerson; i++) {
      const person = {
        id: faker.string.uuid(),
        companyId: company.id,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        age: faker.date.birthdate({ min: 18, max: 65, mode: "age" }),
        jobTitle: faker.person.jobTitle(),
        email: faker.internet.email(),
        phone: faker.phone.number(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        avataUrl: faker.image.avatar(),
      };

      personList.push(person);
    }
  }

  return personList;
};

(() => {
  const numberOfCompanies = 10;
  const numberOfPerson = 20;

  const companyList = randomCompanyList(numberOfCompanies);
  const personList = randomPersonList(companyList, numberOfPerson);

  const db = {
    companies: companyList,
    persons: personList,
    users: [],
  };

  fs.writeFile("db.json", JSON.stringify(db), (err) => {
    if (err) {
      console.error("Error writing to db.json: ", err);
    } else {
      console.log("Generate data successfully!");
    }
  });
})();
