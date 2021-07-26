using System.ComponentModel.DataAnnotations;

namespace API.DTOs
{
    public class RegisterDto : LoginDto
    {
        [Required]
        [EmailAddress]
        public string Email { get; set; }
    }
}