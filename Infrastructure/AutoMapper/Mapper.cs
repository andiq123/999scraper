using AutoMapper;
using Core.DTOs;
using Infrastructure.IdentityEntities;

namespace Infrastructure.AutoMapper
{
    public class Mapper : Profile
    {
        public Mapper()
        {
            CreateMap<AppUser, UserDto>().ForMember(x => x.Token, opt => opt.Ignore());
        }
    }
}