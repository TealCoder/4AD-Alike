// Rooms (swap this file to change the adventure)

const Rooms = [
  {
    name: "Haunted School Entrance", // 0
    image: "images/HauntedSchool.png",
    power: -1,
    searched: true,
    monster_present: false,
  },
  {
    name: "Lockers", // 1
    image: "images/Lockers.png",
    power: -1,
    monster_present: {
      name: "Locker Ghouls",
      image: "images/LockersGhouls.png",
      power: 3,
      hp: 2,
      hpMax: 2,
    },
  },
  {
    name: "Haunted Classroom", // 2
    image: "images/Classroom2.png",
    power: -1,
    monster_present: {
      name: "Paper Cut Swarm",
      image: "images/PaperCutSwarm.png",
      power: 4,
      hp: 3,
      hpMax: 3,
    },
  },
  {
    name: "Cursed Chalkboard", // 3
    image: "images/Classroom1.png",
    power: -1,
    monster_present: {
      name: "Demon Teacher",
      image: "images/DemonTeacher.png",
      power: 5,
      hp: 4,
      hpMax: 4,
    },
  },
  {
    name: "Dean Diablo's Office", // 4
    image: "images/DeansOffice.png",
    power: -1,
    monster_present: {
      name: "Dean Diablo",
      image: "images/DeanDiablo.png",
      power: 6,
      hp: 5,
      hpMax: 5,
    },
  },
];

const ROOM_BASE = Rooms.map(room => structuredClone(room));

function resetRooms() {
  for (let i = 0; i < ROOM_BASE.length; i++) {
    Rooms[i] = structuredClone(ROOM_BASE[i]);
  }
}
