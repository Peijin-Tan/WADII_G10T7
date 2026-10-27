
<script setup>
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const displayName = computed(() => auth.user?.name || 'Guest')

const profileImage =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB3oG6XLP0L5HhXmr7nV_d_hl50ix4lGiZQ0kuDbP0XtRO1ipuH91kh8Yp7P_pTMQ7fcx3IaXa3zJgpBgg9G8tnEkxK9a4-fNTQ2PCs6G1-DmO1SyppBRpyQVNTPnihBYmU1wy97GDkuqG1mPpF4yuT5Fk3RjOeTAQ0_zSZ6jQP-g7-TSs1Er6zPZC9wADCJEnckhg_EdCUtQB46jPa0yb-JvKtvqoVsY-xFXz5i30'

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <main class="profile-page">
    <div class="profile-container">
      <RouterLink to="/home" class="profile-back">
        ← Back to Home
      </RouterLink>

      <section class="profile-card">
        <div class="profile-header">
          <img
            :src="profileImage"
            alt="User profile"
            class="profile-image"
          />

          <h1>{{ displayName }}</h1>
        </div>

        <div class="profile-options">
          <RouterLink
            to="/preferences"
            class="profile-option"
          >
            <div class="option-icon">🥗</div>

            <div class="option-content">
              <h2>Dietary Preferences</h2>
              <p>
                Manage your dietary preferences and food allergens.
              </p>
            </div>

            <span class="option-arrow">›</span>
          </RouterLink>
        </div>

        <button
          type="button"
          class="profile-logout"
          @click="handleLogout"
        >
          Log Out
        </button>
      </section>
    </div>
  </main>
</template>

<style scoped>
.profile-page {
  flex: 1;
  min-height: 70vh;
  padding: 48px 20px;
  background: #fafaf3;
  font-family: 'Inter', sans-serif;
}

.profile-container {
  max-width: 650px;
  margin: 0 auto;
}

.profile-back {
  display: inline-block;
  margin-bottom: 24px;
  color: #32533c;
  text-decoration: none;
  font-weight: 600;
}

.profile-back:hover {
  text-decoration: underline;
}

.profile-card {
  padding: 36px;
  background: #fff;
  border: 1px solid #e8e9e2;
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
}

.profile-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-bottom: 32px;
}

.profile-image {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  object-fit: cover;
  border: 4px solid #c7ecce;
  margin-bottom: 16px;
}

.profile-header h1 {
  margin: 0;
  color: #32533c;
  font-size: 28px;
  font-weight: 700;
}

.profile-options {
  border-top: 1px solid #e8e9e2;
  border-bottom: 1px solid #e8e9e2;
}

.profile-option {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 8px;
  color: inherit;
  text-decoration: none;
  border-radius: 12px;
  transition: background-color 0.2s ease;
}

.profile-option:hover {
  background: #f4f4ed;
}

.option-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #e8f2e8;
  font-size: 24px;
}

.option-content {
  flex: 1;
}

.option-content h2 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
  color: #32533c;
}

.option-content p {
  margin: 0;
  color: #727972;
  font-size: 14px;
  line-height: 1.5;
}

.option-arrow {
  color: #32533c;
  font-size: 28px;
}

.profile-logout {
  width: 100%;
  margin-top: 28px;
  padding: 13px 20px;
  border: 1px solid #dc2626;
  border-radius: 12px;
  background: #dc2626;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.profile-logout:hover {
  background: #b91c1c;
}

@media (max-width: 480px) {
  .profile-card {
    padding: 24px 18px;
  }

  .profile-option {
    gap: 12px;
  }
}
</style>
