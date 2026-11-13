import dotenv from "dotenv"
dotenv.config()

import mongoose from "mongoose"
import { connectDB } from "../config/db"
import { UserModel, UserRole } from "../models/user.model"

const SEED_USERS = [
  {
    fullName: "STRIDEX System Admin",
    email: "admin@stridex.com",
    password: "Admin@Stridex2026!",
    phone: "+1-555-0100",
    role: UserRole.ADMIN,
    isActive: true,
  },
  {
    fullName: "STRIDEX Warehouse Lead",
    email: "inventory@stridex.com",
    password: "Manager@Stridex2026!",
    phone: "+1-555-0200",
    role: UserRole.INVENTORY_MANAGER,
    isActive: true,
  },
  {
    fullName: "Alex Rivera",
    email: "customer@stridex.com",
    password: "Customer@Stridex2026!",
    phone: "+1-555-0300",
    role: UserRole.CUSTOMER,
    isActive: true,
  },
]

const seedUsers = async () => {
  try {
    console.log("==================================================")
    console.log("🌱 STRIDEX Safe Seed: Initializing Staff & Users...")
    console.log("==================================================")

    await connectDB()

    for (const data of SEED_USERS) {
      const existing = await UserModel.findOne({ email: data.email })
      if (existing) {
        console.log(`ℹ️ User ${data.email} (${data.role}) already exists. Updating credentials...`)
        existing.fullName = data.fullName
        existing.password = data.password // Pre-save hook will hash this
        existing.role = data.role
        existing.isActive = true
        await existing.save()
        console.log(`   Updated: ${data.email}`)
      } else {
        const user = new UserModel(data)
        await user.save()
        console.log(`✅ Created: ${data.email} [${data.role}]`)
      }
    }

    console.log("==================================================")
    console.log("✨ Seeding completed successfully on MongoDB Atlas!")
    console.log("==================================================")
  } catch (error) {
    console.error("❌ Seeding failed:", error)
  } finally {
    await mongoose.connection.close()
    process.exit(0)
  }
}

seedUsers()
