# ARASE Platform Development Guidelines

This document contains distilled knowledge, architectural rules, and context accumulated through recent development cycles of the ARASE Platform. Reference this document to ensure consistency across the codebase.

## 1. Tech Stack
- **Frontend**: Next.js (React 19), Tailwind CSS, Axios, Lucide React.
- **Backend**: Django, Django REST Framework, Celery, Redis.
- **Infrastructure**: Railway/Render (using Next.js proxy to circumvent CORS issues and handle authentication routing securely).

## 2. Authentication & Security
- **Dual-Login Capability**: Login natively resolves both username and email to a canonical user via an overridden `CustomTokenObtainPairSerializer`.
- **Production Routing**: The frontend Next.js app actively proxies backend authentication requests to prevent CORS/unreachability errors on Render/Railway.
- **Security Hardening**: Secure handling of JWTs leveraging HttpOnly cookies. Ensure `ALLOWED_HOSTS` strictly matches the deployed environment domain.

## 3. UI/UX & Frontend Architecture
- **Native-App Feel**: The interface should feel incredibly lightweight and interactive. Utilize responsive card-based list views, horizontal scrolling filters on mobile, and centralized profile settings to declutter the global header (e.g., burying logout buttons behind profile drop-downs on mobile).
- **Unified Workspaces**: Avoid isolated, multi-page architectures. Merge logically grouped viewers (such as Admin Input Forms & Reports) into a single, zero-load workspace to optimize navigation performance.
- **Backend-Driven State**: Visual priority rules and unified status badge color coding should be driven by the backend sorting logic to avoid inconsistencies with frontend redundant logic.
- **Non-blocking Communications**: Use a robust, polling-based dual-notification bell system. Do not use legacy browser-blocking alerts.
- **Internationalization Check**: When developing user-facing automated content (like birthday slideshows), accurately mirror translation honorifics (e.g. Korean second-person perspectives). Avoid deployment UI failure on assets by maintaining correct file extension casing.

## 4. Core Business Logic Workflows
- **IEP Enrollment Refactoring**: 
  - **Pre-enrollment** is restricted strictly to Parent and Specialist assessments. 
  - **Teachers are explicitly excluded** from the initial IEP generation process. 
  - Teacher engagement is unlocked solely *post-enrollment* via staff assignment logic, allowing them to submit monthly progress reports. 
  - Never expose SPED assessment forms to teachers in the pre-enrollment UI.

## 5. Deployment / Tooling Health
- Continuously scrub database artifacts (e.g., removing static/default admin accounts post-initial deployment).
- When integrating Celery/Redis background jobs, properly tie external Railway host environment variables to your Django setting modules.
