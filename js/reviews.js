// ==============================================================================
// LITTLE CLOUD SHOP - REAL REVIEWS ENGINE (Direct Supabase)
// ==============================================================================

class ReviewsManager {
  constructor() {
    this.selectedRating = 5;
    this.bindEvents();
  }

  bindEvents() {
    // Star rating selector
    document.querySelectorAll('.star-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rating = parseInt(btn.dataset.rating);
        this.selectedRating = rating;
        this.updateStarUI(rating);
      });
    });

    const formReview = document.getElementById('form-submit-review');
    if (formReview) {
      formReview.addEventListener('submit', (e) => this.handleSubmitReview(e));
    }
  }

  updateStarUI(rating) {
    document.querySelectorAll('.star-select-btn').forEach(b => {
      const r = parseInt(b.dataset.rating);
      if (r <= rating) {
        b.innerHTML = '<i class="fas fa-star" style="color: #f59e0b;"></i>';
      } else {
        b.innerHTML = '<i class="far fa-star" style="color: #64748b;"></i>';
      }
    });
  }

  async getReviews() {
    return await window.supabaseManager.fetchTable('reviews');
  }

  async renderReviews() {
    const grid = document.getElementById('reviews-grid');
    if (!grid) return;

    if (!window.supabaseManager.isConnected) {
      grid.innerHTML = `<p style="text-align:center; color: var(--text-muted); grid-column: 1/-1;">กรุณาเชื่อมต่อ Supabase เพื่อดูรีวิวจากฐานข้อมูลจริง</p>`;
      return;
    }

    const reviews = await this.getReviews();
    if (reviews.length === 0) {
      grid.innerHTML = `<p style="text-align:center; color: var(--text-muted); grid-column: 1/-1;">ยังไม่มีรีวิวเป็นคนแรกที่รีวิวร้าน Little Cloud Shop เลย!</p>`;
      return;
    }

    grid.innerHTML = reviews.map(r => {
      const starsHtml = '★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5));
      return `
        <div class="review-card">
          <div class="review-header">
            <div class="review-user">
              <div class="review-avatar">${(r.username || 'U').substring(0, 2).toUpperCase()}</div>
              <div>
                <div class="review-name">${r.username}</div>
                <div class="review-product-tag">${r.product_name || 'ลูกค้าประจำ'}</div>
              </div>
            </div>
            <div class="review-stars">${starsHtml}</div>
          </div>
          <p class="review-comment">"${r.comment}"</p>
          <div style="font-size: 0.72rem; color: #7f679e; margin-top: 8px;">
            ${new Date(r.created_at || Date.now()).toLocaleDateString('th-TH')}
          </div>
        </div>
      `;
    }).join('');
  }

  openWriteReviewModal() {
    const user = window.authManager.currentUser;
    if (!user) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเข้าสู่ระบบ',
        text: 'คุณต้องเข้าสู่ระบบก่อนเขียนรีวิวร้านค้า',
        showCancelButton: true,
        confirmButtonText: 'เข้าสู่ระบบ',
        cancelButtonText: 'ยกเลิก',
        background: '#180a2f',
        color: '#fff',
        confirmButtonColor: '#d946ef'
      }).then(r => {
        if (r.isConfirmed) window.authManager.openAuthModal('login');
      });
      return;
    }

    const modal = document.getElementById('modal-write-review');
    if (modal) {
      modal.classList.add('active');
      this.updateStarUI(5);
    }
  }

  closeWriteReviewModal() {
    const modal = document.getElementById('modal-write-review');
    if (modal) modal.classList.remove('active');
  }

  async handleSubmitReview(e) {
    e.preventDefault();
    const user = window.authManager.currentUser;
    if (!user) return;

    const comment = document.getElementById('review-comment-input').value.trim();
    const productName = document.getElementById('review-product-input').value.trim() || 'บริการโดยรวม';

    if (!comment) {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อความรีวิว', background: '#180a2f', color: '#fff' });
      return;
    }

    const newReview = {
      user_id: user.id,
      username: user.username,
      rating: this.selectedRating,
      comment: comment,
      product_name: productName
    };

    try {
      await window.supabaseManager.insertRecord('reviews', newReview);
      this.closeWriteReviewModal();
      this.renderReviews();

      Swal.fire({
        icon: 'success',
        title: 'ขอบคุณสำหรับรีวิว!',
        text: 'รีวิวของคุณได้รับการบันทึกลง Supabase เรียบร้อยแล้ว',
        timer: 1800,
        showConfirmButton: false,
        background: '#180a2f',
        color: '#fff'
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถส่งรีวิวได้', text: err.message, background: '#180a2f', color: '#fff' });
    }
  }
}

window.reviewsManager = new ReviewsManager();
