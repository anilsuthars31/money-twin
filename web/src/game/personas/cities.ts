// Local flavour for each city: who you pay for lunch, how you get around, where you go on weekends,
// and how expensive rent is. UPI names are cut to 15 characters, like Kotak statements show them.

export interface CityFlavour {
  city: string;
  lunchVendors: string[]; // show up as person names on UPI
  chaiVendors: string[];
  transport: string[]; // apps / transit you pay by UPI
  eatOut: string; // the famous local place for a birthday treat
  studentTrip: { title: string; body: string; cost: number };
  weekendTrip: { place: string; costScale: number }; // for salaried twins; 1 = base price
  rentScale: number; // 1 = Bengaluru
}

const BENGALURU: CityFlavour = {
  city: "Bengaluru",
  lunchVendors: ["Manjunath S", "Lakshmamma", "Ravi Kumar K", "Venkatesh Gowda", "Shivanna M"],
  chaiVendors: ["Nagaraj Tea Sta", "Basavaraj", "Mahesh Condimen"],
  transport: ["Rapido", "Namma Yatri", "BMTC"],
  eatOut: "Meghana Foods",
  studentTrip: {
    title: "Nandi Hills sunrise ride?",
    body: "Your hostel group leaves at 4am on Sunday the 16th. Fuel and breakfast come to ₹650 each.",
    cost: 650,
  },
  weekendTrip: { place: "Coorg", costScale: 1 },
  rentScale: 1,
};

export const CITIES: Record<string, CityFlavour> = {
  Bengaluru: BENGALURU,
  Mumbai: {
    city: "Mumbai",
    lunchVendors: ["Santosh Kadam", "Ganesh Jadhav", "Sunil Patil", "Anita More", "Prakash Shinde"],
    chaiVendors: ["Irani Chai", "Raju Tapri", "Mahesh Gupta"],
    transport: ["Mumbai Local", "Uber", "Best Undertakin"],
    eatOut: "Bademiya",
    studentTrip: {
      title: "Lonavala monsoon trek?",
      body: "The gang is taking the 6am local on Sunday the 16th. Train, vada pav and entry come to ₹700 each.",
      cost: 700,
    },
    weekendTrip: { place: "Alibaug", costScale: 1.1 },
    rentScale: 1.45,
  },
  Delhi: {
    city: "Delhi",
    lunchVendors: ["Rajesh Kumar", "Sanjay Yadav", "Mohd Salim", "Pappu Chole Kul", "Suresh Chand"],
    chaiVendors: ["Sharma Tea Stal", "Bittu", "Ramesh Lal"],
    transport: ["Delhi Metro Rai", "Uber", "Rapido"],
    eatOut: "Haldirams",
    studentTrip: {
      title: "Rishikesh rafting weekend?",
      body: "Friends are taking the overnight bus on Saturday the 15th. Bus, rafting and a dorm bed come to ₹1,200 each.",
      cost: 1200,
    },
    weekendTrip: { place: "Shimla", costScale: 1.1 },
    rentScale: 1.2,
  },
  Hyderabad: {
    city: "Hyderabad",
    lunchVendors: ["Srinivas Reddy", "Ramesh Goud", "Mohammed Ali", "Lakshmi Tiffins", "Venkat Rao"],
    chaiVendors: ["Nimrah Cafe", "Irfan Chai", "Yadagiri"],
    transport: ["Hyderabad Metr", "Rapido", "Uber"],
    eatOut: "Paradise Biryani",
    studentTrip: {
      title: "Ananthagiri Hills ride?",
      body: "Your hostel group leaves at 5am on Sunday the 16th. Fuel and breakfast come to ₹600 each.",
      cost: 600,
    },
    weekendTrip: { place: "Srisailam", costScale: 0.9 },
    rentScale: 1,
  },
  Pune: {
    city: "Pune",
    lunchVendors: ["Vaibhav Joshi", "Sachin Pawar", "Mangal Kulkarni", "Amruta Deshmuk", "Rahul Gaikwad"],
    chaiVendors: ["Amruttulya", "Yewale Tea", "Dattatray"],
    transport: ["Rapido", "PMPML", "Uber"],
    eatOut: "Vaishali",
    studentTrip: {
      title: "Sinhagad fort trek?",
      body: "Everyone's leaving at 5am on Sunday the 16th. Fuel, pitla bhakri and chai come to ₹500 each.",
      cost: 500,
    },
    weekendTrip: { place: "Mahabaleshwar", costScale: 1 },
    rentScale: 1.1,
  },
  Chennai: {
    city: "Chennai",
    lunchVendors: ["Murugan S", "Karthik R", "Selvi Mess", "Anbu Tiffin Cen", "Ganesan K"],
    chaiVendors: ["Kumar Tea Stall", "Balu", "Senthil"],
    transport: ["Chennai Metro", "Rapido", "Uber"],
    eatOut: "Saravana Bhavan",
    studentTrip: {
      title: "Mahabalipuram beach ride?",
      body: "Your hostel group leaves at 5am on Sunday the 16th via ECR. Fuel and breakfast come to ₹550 each.",
      cost: 550,
    },
    weekendTrip: { place: "Pondicherry", costScale: 1 },
    rentScale: 1.05,
  },
  Kolkata: {
    city: "Kolkata",
    lunchVendors: ["Sourav Das", "Biswajit Ghosh", "Tapan Mondal", "Shyamal Pal", "Rina Saha"],
    chaiVendors: ["Bapi Da", "Gopal Chaiwala", "Nitai"],
    transport: ["Kolkata Metro", "Uber", "Rapido"],
    eatOut: "Arsalan",
    studentTrip: {
      title: "Digha beach trip?",
      body: "Friends are taking the early train on Sunday the 16th. Tickets, fish fry and a shared room come to ₹800 each.",
      cost: 800,
    },
    weekendTrip: { place: "Darjeeling", costScale: 1.1 },
    rentScale: 0.85,
  },
  Jaipur: {
    city: "Jaipur",
    lunchVendors: ["Mahendra Singh", "Ramesh Meena", "Suresh Sharma", "Kailash Choudh", "Gopal Saini"],
    chaiVendors: ["Gulab Ji Chai", "Babulal", "Om Prakash"],
    transport: ["Rapido", "Uber", "Jaipur Metro"],
    eatOut: "LMB",
    studentTrip: {
      title: "Nahargarh sunset ride?",
      body: "Your hostel group is heading up on Sunday the 16th. Fuel, entry and pyaaz kachori come to ₹450 each.",
      cost: 450,
    },
    weekendTrip: { place: "Udaipur", costScale: 1 },
    rentScale: 0.8,
  },
};

/** Unknown cities fall back to neutral names with their own city label. */
export function cityFlavour(city: string): CityFlavour {
  const known = CITIES[city];
  if (known) return known;
  return {
    ...BENGALURU,
    city,
    lunchVendors: ["Ramesh Kumar", "Suresh Babu", "Mahesh Rao", "Lakshmi Devi", "Raju Tiffin"],
    chaiVendors: ["Sharma Tea Stal", "Babu Chai", "Mohan"],
    transport: ["Rapido", "Uber", "Ola"],
    eatOut: "Hotel Annapoorna",
    studentTrip: {
      title: "Sunrise ride with the hostel gang?",
      body: "They're leaving at 5am on Sunday the 16th. Fuel and breakfast come to ₹600 each.",
      cost: 600,
    },
    weekendTrip: { place: "the hills", costScale: 1 },
  };
}
